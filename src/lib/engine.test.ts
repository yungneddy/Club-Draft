import { describe, expect, it } from 'vitest';
import type { GameSettings, GameSetup, Question } from '../types';
import {
  createGame,
  currentPlayer,
  gameReducer,
  hintsLeft,
  passesLeft,
  questionNumber,
  questionsWanted,
  standings,
  type GameAction,
  type GameState,
} from './engine';

const settings: GameSettings = {
  rounds: 2,
  questionsPerRound: 2,
  passesPerRound: 1,
  hintsPerRound: 1,
  answerMode: 'reveal',
  drinking: true,
};

function questions(n: number, prefix = 'Q'): Question[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, prompt: `${prefix} question ${i}?`, answer: `A${i}`, hint: 'h' }));
}

function setup(players = 2, overrides: Partial<GameSettings> = {}): GameSetup {
  return {
    kind: 'trivia',
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, interests: '', color: '#fff' })),
    settings: { ...settings, ...overrides },
    options: { topic: 'Test', difficulty: 'mixed' },
  };
}

function game(players = 2, overrides: Partial<GameSettings> = {}, count = 50): GameState {
  const s = setup(players, overrides);
  return createGame(s, [{ key: 'main', label: 'Test', topic: '', playerIds: s.players.map((p) => p.id), source: 'ai' }], {
    main: questions(count),
  });
}

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
const right: GameAction = { type: 'answer', correct: true };
const wrong: GameAction = { type: 'answer', correct: false };
const next: GameAction = { type: 'next' };

describe('turn order', () => {
  it('alternates players question by question, then ends the round', () => {
    let s = game();
    expect(currentPlayer(s).id).toBe('p0');
    s = run(s, right, next);
    expect(currentPlayer(s).id).toBe('p1');
    expect(questionNumber(s)).toBe(1);
    s = run(s, wrong, next);
    expect(currentPlayer(s).id).toBe('p0');
    expect(questionNumber(s)).toBe(2);
    s = run(s, right, next, right, next);
    expect(s.phase).toBe('roundEnd');
    s = run(s, { type: 'nextRound' });
    expect(s.round).toBe(2);
    expect(currentPlayer(s).id).toBe('p0');
    s = run(s, right, next, right, next, right, next, right, next);
    expect(s.phase).toBe('finished');
  });

  it('never hands out the same question twice', () => {
    let s = game();
    const seen = new Set<string>();
    while (s.phase !== 'finished') {
      if (s.phase === 'roundEnd') {
        s = run(s, { type: 'nextRound' });
        continue;
      }
      expect(seen.has(s.current!.id)).toBe(false);
      seen.add(s.current!.id);
      s = run(s, right, next);
    }
    expect(seen.size).toBe(8);
  });
});

describe('scoring and drinking', () => {
  it('scores correct answers, tracks streaks and calls drinks', () => {
    let s = game(1, { questionsPerRound: 5, rounds: 1 });
    s = run(s, right, next, right, next, right);
    expect(s.stats.p0.score).toBe(3);
    expect(s.last?.drinks).toEqual([{ kind: 'give', sips: 2, reason: '3 in a row' }]);
    s = run(s, next, wrong);
    expect(s.stats.p0.streak).toBe(0);
    expect(s.stats.p0.bestStreak).toBe(3);
    expect(s.stats.p0.sips).toBe(1);
    expect(s.last?.drinks[0].kind).toBe('take');
  });

  it('calls no drinks when drinking mode is off', () => {
    const s = run(game(1, { drinking: false }), wrong);
    expect(s.last?.drinks).toEqual([]);
    expect(s.stats.p0.sips).toBe(0);
  });

  it('ranks ties together', () => {
    let s = game(3, { rounds: 1, questionsPerRound: 1 });
    s = run(s, right, next, right, next, wrong, next);
    expect(standings(s).map((r) => [r.player.id, r.rank])).toEqual([
      ['p0', 1],
      ['p1', 1],
      ['p2', 3],
    ]);
  });
});

describe('passes and hints', () => {
  it('limits passes per round and replaces the question without using a turn', () => {
    let s = game();
    const first = s.current!.id;
    s = run(s, { type: 'pass' });
    expect(s.current!.id).not.toBe(first);
    expect(currentPlayer(s).id).toBe('p0');
    expect(passesLeft(s)).toBe(0);
    expect(s.last?.outcome).toBe('pass');
    expect(s.stats.p0.sips).toBe(1);
    const second = s.current!.id;
    s = run(s, { type: 'pass' });
    expect(s.current!.id).toBe(second);
  });

  it('cannot pass after revealing the answer', () => {
    const s = run(game(), { type: 'reveal' }, { type: 'pass' });
    expect(s.stats.p0.passes).toBe(0);
  });

  it('limits hints per round and resets both each round', () => {
    let s = game();
    s = run(s, { type: 'hint' });
    expect(s.hintShown).toBe(true);
    expect(hintsLeft(s)).toBe(0);
    s = run(s, right, next, right, next);
    expect(s.hintShown).toBe(false);
    s = run(s, { type: 'hint' });
    expect(s.hintShown).toBe(false);
    s = run(s, { type: 'pass' }, right, next, right, next, { type: 'nextRound' });
    expect(hintsLeft(s, 'p0')).toBe(1);
    expect(passesLeft(s, 'p0')).toBe(1);
  });
});

describe('undo', () => {
  it('restores the state from before the answer', () => {
    const before = run(game(), { type: 'hint' });
    const after = run(before, wrong, { type: 'undo' });
    expect(after.stats).toEqual(before.stats);
    expect(after.phase).toBe('question');
    expect(after.current).toEqual(before.current);
    expect(after.hintShown).toBe(true);
  });
});

describe('question supply', () => {
  it('waits for questions and draws as soon as they arrive', () => {
    const s0 = setup(1);
    let s = createGame(s0, [{ key: 'main', label: '', topic: '', playerIds: ['p0'], source: 'ai' }]);
    expect(s.current).toBeNull();
    s = run(s, { type: 'addQuestions', pool: 'main', questions: questions(2) });
    expect(s.current?.id).toBe('Q0');
    expect(s.pools.main).toHaveLength(1);
  });

  it('drops duplicate questions unless repeats are allowed', () => {
    let s = game(1, {}, 2);
    s = run(s, { type: 'addQuestions', pool: 'main', questions: questions(3) });
    expect(s.poolInfo.main.added).toBe(3);
    s = run(s, { type: 'addQuestions', pool: 'main', questions: questions(1), allowRepeats: true });
    expect(s.poolInfo.main.added).toBe(4);
  });

  it('keeps separate queues for players with different interests', () => {
    const s0 = setup(2);
    const s = createGame(
      s0,
      [
        { key: 'a', label: 'A', topic: '', playerIds: ['p0'], source: 'ai' },
        { key: 'b', label: 'B', topic: '', playerIds: ['p1'], source: 'ai' },
      ],
      { a: questions(5, 'A'), b: questions(5, 'B') },
    );
    expect(s.current?.id).toBe('A0');
    const s2 = run(s, right, next);
    expect(s2.current?.id).toBe('B0');
    expect(questionsWanted(s2, 'a')).toBe(2 * (2 + 1));
  });
});
