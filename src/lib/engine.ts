import type { GameSetup, Player, Question } from '../types';
import { normalize, uid } from './random';

/** Sips handed out for every third correct answer in a row (drinking mode). */
export const STREAK_LENGTH = 3;
export const STREAK_GIVE_SIPS = 2;
export const WRONG_SIPS = 1;
export const PASS_SIPS = 1;

export interface PlayerStats {
  score: number;
  correct: number;
  wrong: number;
  passes: number;
  hints: number;
  streak: number;
  bestStreak: number;
  sips: number;
  sipsGiven: number;
  roundScore: number;
  roundPasses: number;
  roundHints: number;
}

export type Outcome = 'correct' | 'wrong' | 'pass';

export interface DrinkCall {
  kind: 'take' | 'give';
  sips: number;
  reason: string;
}

export interface TurnResult {
  playerId: string;
  outcome: Outcome;
  question: Question;
  picked?: string;
  usedHint: boolean;
  streak: number;
  drinks: DrinkCall[];
}

/** A queue of questions shared by every player with the same topic. */
export interface PoolInfo {
  label: string;
  topic: string;
  /** How many questions have ever been added to this pool. */
  added: number;
  /** No more questions are coming for this pool. */
  exhausted: boolean;
  /** Where new questions come from: Claude, or the built-in bank. */
  source: 'ai' | 'local';
}

export type Phase = 'question' | 'feedback' | 'roundEnd' | 'finished';

export interface GameState {
  id: string;
  setup: GameSetup;
  stats: Record<string, PlayerStats>;
  pools: Record<string, Question[]>;
  poolOf: Record<string, string>;
  poolInfo: Record<string, PoolInfo>;
  /** `questionKey` of every question added so far, to drop duplicates. */
  asked: string[];
  round: number;
  /** Index into the round's turns: player `turn % players`, question `turn / players`. */
  turn: number;
  current: Question | null;
  hintShown: boolean;
  revealed: boolean;
  phase: Phase;
  last: TurnResult | null;
  /** Bumped on every answer or pass so the UI can react to repeated outcomes. */
  seq: number;
  /** Snapshot from just before the last answer, for "undo". */
  undo: GameState | null;
}

export type GameAction =
  /** `allowRepeats` keeps questions already seen this game (small country pools cycle). */
  | { type: 'addQuestions'; pool: string; questions: Question[]; allowRepeats?: boolean }
  | { type: 'markExhausted'; pool: string }
  | { type: 'setPoolSource'; pool: string; source: PoolInfo['source'] }
  | { type: 'hint' }
  | { type: 'reveal' }
  | { type: 'pass' }
  | { type: 'answer'; correct: boolean; picked?: string }
  | { type: 'undo' }
  | { type: 'next' }
  | { type: 'nextRound' }
  | { type: 'finish' };

export interface PoolDef {
  key: string;
  label: string;
  topic: string;
  playerIds: string[];
  source: PoolInfo['source'];
}

function emptyStats(): PlayerStats {
  return {
    score: 0,
    correct: 0,
    wrong: 0,
    passes: 0,
    hints: 0,
    streak: 0,
    bestStreak: 0,
    sips: 0,
    sipsGiven: 0,
    roundScore: 0,
    roundPasses: 0,
    roundHints: 0,
  };
}

export function createGame(
  setup: GameSetup,
  pools: PoolDef[],
  initial: Record<string, Question[]> = {},
  allowRepeats = false,
): GameState {
  let state: GameState = {
    id: uid(),
    setup,
    stats: Object.fromEntries(setup.players.map((p) => [p.id, emptyStats()])),
    pools: Object.fromEntries(pools.map((p) => [p.key, []])),
    poolOf: Object.fromEntries(pools.flatMap((p) => p.playerIds.map((id) => [id, p.key]))),
    poolInfo: Object.fromEntries(
      pools.map((p) => [p.key, { label: p.label, topic: p.topic, added: 0, exhausted: false, source: p.source }]),
    ),
    asked: [],
    round: 1,
    turn: 0,
    current: null,
    hintShown: false,
    revealed: false,
    phase: 'question',
    last: null,
    seq: 0,
    undo: null,
  };
  for (const [pool, questions] of Object.entries(initial)) {
    state = gameReducer(state, { type: 'addQuestions', pool, questions, allowRepeats });
  }
  return state;
}

export function currentPlayer(state: GameState): Player {
  const { players } = state.setup;
  return players[state.turn % players.length];
}

export function nextPlayer(state: GameState): Player {
  const { players } = state.setup;
  return players[(state.turn + 1) % players.length];
}

/** 1-based number of the question the current player is on this round. */
export function questionNumber(state: GameState): number {
  return Math.floor(state.turn / state.setup.players.length) + 1;
}

export function turnsPerRound(state: GameState): number {
  return state.setup.settings.questionsPerRound * state.setup.players.length;
}

export function isLastTurnOfRound(state: GameState): boolean {
  return state.turn + 1 >= turnsPerRound(state);
}

export function passesLeft(state: GameState, playerId = currentPlayer(state).id): number {
  return Math.max(0, state.setup.settings.passesPerRound - state.stats[playerId].roundPasses);
}

export function hintsLeft(state: GameState, playerId = currentPlayer(state).id): number {
  return Math.max(0, state.setup.settings.hintsPerRound - state.stats[playerId].roundHints);
}

/** Questions still needed by a pool to finish the game, assuming every pass is used. */
export function questionsWanted(state: GameState, pool: string): number {
  const { settings } = state.setup;
  const players = Object.values(state.poolOf).filter((p) => p === pool).length;
  return players * settings.rounds * (settings.questionsPerRound + settings.passesPerRound);
}

export interface Standing {
  player: Player;
  stats: PlayerStats;
  rank: number;
}

export function standings(state: GameState): Standing[] {
  const rows = state.setup.players
    .map((player) => ({ player, stats: state.stats[player.id] }))
    .sort((a, b) => b.stats.score - a.stats.score || a.stats.wrong - b.stats.wrong);
  let rank = 0;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.stats.score !== row.stats.score || prev.stats.wrong !== row.stats.wrong) rank = i + 1;
    return { ...row, rank };
  });
}

export function accuracy(stats: PlayerStats): number | null {
  const answered = stats.correct + stats.wrong;
  return answered ? stats.correct / answered : null;
}

/** Identity of a question for duplicate checks: flag questions share a prompt, so include the answer. */
export function questionKey(q: Question): string {
  return normalize(`${q.prompt} ${q.answer} ${q.flag ?? ''}`);
}

function withStats(state: GameState, playerId: string, change: Partial<PlayerStats>): GameState['stats'] {
  return { ...state.stats, [playerId]: { ...state.stats[playerId], ...change } };
}

/** Moves the current player's next question into `current`. */
function draw(state: GameState): GameState {
  const pool = state.poolOf[currentPlayer(state).id];
  const [next, ...rest] = state.pools[pool] ?? [];
  return {
    ...state,
    pools: { ...state.pools, [pool]: rest },
    current: next ?? null,
    hintShown: false,
    revealed: false,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'addQuestions': {
      const asked = new Set(state.asked);
      const fresh = action.questions.filter((q) => {
        const key = questionKey(q);
        if (asked.has(key) && !action.allowRepeats) return false;
        asked.add(key);
        return true;
      });
      const info = state.poolInfo[action.pool];
      if (!info) return state;
      let next: GameState = {
        ...state,
        asked: [...asked],
        pools: { ...state.pools, [action.pool]: [...state.pools[action.pool], ...fresh] },
        poolInfo: { ...state.poolInfo, [action.pool]: { ...info, added: info.added + fresh.length } },
      };
      if (next.phase === 'question' && !next.current && next.poolOf[currentPlayer(next).id] === action.pool) {
        next = draw(next);
      }
      return next;
    }

    case 'markExhausted':
    case 'setPoolSource': {
      const info = state.poolInfo[action.pool];
      if (!info) return state;
      const change = action.type === 'markExhausted' ? { exhausted: true } : { source: action.source };
      return { ...state, poolInfo: { ...state.poolInfo, [action.pool]: { ...info, ...change } } };
    }

    case 'hint': {
      if (state.phase !== 'question' || !state.current || state.hintShown || state.revealed) return state;
      const id = currentPlayer(state).id;
      if (hintsLeft(state, id) <= 0) return state;
      const s = state.stats[id];
      return {
        ...state,
        hintShown: true,
        stats: withStats(state, id, { hints: s.hints + 1, roundHints: s.roundHints + 1 }),
      };
    }

    case 'reveal': {
      if (state.phase !== 'question' || !state.current) return state;
      return { ...state, revealed: true };
    }

    case 'pass': {
      if (state.phase !== 'question' || !state.current || state.revealed) return state;
      const id = currentPlayer(state).id;
      if (passesLeft(state, id) <= 0) return state;
      const s = state.stats[id];
      const drinking = state.setup.settings.drinking;
      const drinks: DrinkCall[] = drinking ? [{ kind: 'take', sips: PASS_SIPS, reason: 'Passed' }] : [];
      return draw({
        ...state,
        stats: withStats(state, id, {
          passes: s.passes + 1,
          roundPasses: s.roundPasses + 1,
          sips: s.sips + (drinking ? PASS_SIPS : 0),
        }),
        last: { playerId: id, outcome: 'pass', question: state.current, usedHint: state.hintShown, streak: s.streak, drinks },
        seq: state.seq + 1,
      });
    }

    case 'answer': {
      if (state.phase !== 'question' || !state.current) return state;
      const id = currentPlayer(state).id;
      const s = state.stats[id];
      const drinking = state.setup.settings.drinking;
      const drinks: DrinkCall[] = [];
      let change: Partial<PlayerStats>;
      if (action.correct) {
        const streak = s.streak + 1;
        const onFire = drinking && streak % STREAK_LENGTH === 0;
        if (onFire) drinks.push({ kind: 'give', sips: STREAK_GIVE_SIPS, reason: `${streak} in a row` });
        change = {
          score: s.score + 1,
          roundScore: s.roundScore + 1,
          correct: s.correct + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          sipsGiven: s.sipsGiven + (onFire ? STREAK_GIVE_SIPS : 0),
        };
      } else {
        if (drinking) drinks.push({ kind: 'take', sips: WRONG_SIPS, reason: 'Wrong answer' });
        change = { wrong: s.wrong + 1, streak: 0, sips: s.sips + (drinking ? WRONG_SIPS : 0) };
      }
      const stats = withStats(state, id, change);
      return {
        ...state,
        stats,
        phase: 'feedback',
        revealed: true,
        last: {
          playerId: id,
          outcome: action.correct ? 'correct' : 'wrong',
          question: state.current,
          picked: action.picked,
          usedHint: state.hintShown,
          streak: stats[id].streak,
          drinks,
        },
        seq: state.seq + 1,
        undo: { ...state, undo: null },
      };
    }

    case 'undo': {
      if (state.phase !== 'feedback' || !state.undo) return state;
      return state.undo;
    }

    case 'next': {
      if (state.phase !== 'feedback') return state;
      const base = { ...state, undo: null };
      if (isLastTurnOfRound(state)) {
        return { ...base, current: null, phase: state.round >= state.setup.settings.rounds ? 'finished' : 'roundEnd' };
      }
      return draw({ ...base, turn: state.turn + 1, phase: 'question' });
    }

    case 'nextRound': {
      if (state.phase !== 'roundEnd') return state;
      const stats = Object.fromEntries(
        Object.entries(state.stats).map(([id, s]) => [id, { ...s, roundScore: 0, roundPasses: 0, roundHints: 0 }]),
      );
      return draw({ ...state, stats, round: state.round + 1, turn: 0, phase: 'question' });
    }

    case 'finish':
      return { ...state, current: null, phase: 'finished', undo: null };
  }
}
