import type { FlagOptions, GameKind, GameSettings, GameSetup, GeoOptions, Player, TriviaOptions } from '../types';
import { flagQuestions, geoQuestions } from './countryQuiz';
import { createGame, questionsWanted, type GameState } from './engine';
import { uid } from './random';
import { fetchTrivia, localQuestions, parseTopic, triviaPools } from './trivia';

export const MAX_PLAYERS = 10;

/** Questions requested per pool before the game starts; the rest load in the background. */
export const FIRST_BATCH = 8;
/** Questions per background request. */
export const BATCH = 10;

export const PLAYER_COLORS = [
  '#ff5d8f',
  '#4cc9f0',
  '#ffd166',
  '#06d6a0',
  '#b388ff',
  '#ff9f1c',
  '#f72585',
  '#90e0ef',
  '#c5f277',
  '#ff6b6b',
];

export function newPlayer(index: number): Player {
  return { id: uid(), name: `Player ${index + 1}`, interests: '', color: PLAYER_COLORS[index % PLAYER_COLORS.length] };
}

export function defaultPlayers(): Player[] {
  return [newPlayer(0), newPlayer(1)];
}

export const DEFAULT_SETTINGS: Record<GameKind, GameSettings> = {
  trivia: { rounds: 3, questionsPerRound: 5, passesPerRound: 2, hintsPerRound: 2, answerMode: 'reveal', drinking: false },
  flags: { rounds: 3, questionsPerRound: 5, passesPerRound: 2, hintsPerRound: 2, answerMode: 'choice', drinking: false },
  geography: { rounds: 3, questionsPerRound: 5, passesPerRound: 2, hintsPerRound: 2, answerMode: 'choice', drinking: false },
};

export const DEFAULT_TRIVIA: TriviaOptions = { topic: '', difficulty: 'mixed' };
export const DEFAULT_FLAGS: FlagOptions = { region: 'world', difficulty: 'medium', style: 'mix' };
export const DEFAULT_GEO: GeoOptions = {
  region: 'world',
  difficulty: 'medium',
  types: ['capital', 'capitalOf', 'neighbour', 'bigger', 'continent', 'landlocked'],
};

export const GAME_INFO: Record<GameKind, { title: string; emoji: string; tagline: string }> = {
  trivia: { title: 'Trivia', emoji: '🧠', tagline: 'Any topic you like. Claude writes the questions.' },
  flags: { title: 'Flags', emoji: '🚩', tagline: 'Name the flag, or find it in a line-up.' },
  geography: { title: 'Geography', emoji: '🌍', tagline: 'Capitals, borders, continents and more.' },
};

export function gameTitle(setup: GameSetup): string {
  if (setup.kind === 'trivia') return setup.options.topic.trim() || 'General knowledge';
  return GAME_INFO[setup.kind].title;
}

/** Flags and geography are generated on the device, all at once. */
export function startCountryGame(setup: Extract<GameSetup, { kind: 'flags' | 'geography' }>): GameState {
  const pool = { key: 'main', label: GAME_INFO[setup.kind].title, topic: '', playerIds: setup.players.map((p) => p.id), source: 'local' as const };
  const shell = createGame(setup, [pool]);
  const count = questionsWanted(shell, 'main');
  const questions =
    setup.kind === 'flags'
      ? flagQuestions(setup.options, setup.settings.answerMode, count)
      : geoQuestions(setup.options, setup.settings.answerMode, count);
  const state = createGame(setup, [pool], { main: questions }, true);
  return { ...state, poolInfo: { main: { ...state.poolInfo.main, exhausted: true } } };
}

/**
 * With Claude: fetch a first batch per topic, then the game tops up in the background.
 * Without: fill every pool from the built-in bank up front.
 */
export async function startTriviaGame(
  setup: Extract<GameSetup, { kind: 'trivia' }>,
  ai: { enabled: boolean; accessCode: string },
  signal?: AbortSignal,
): Promise<GameState> {
  const pools = triviaPools(setup.players, setup.options, ai.enabled ? 'ai' : 'local');
  const shell = createGame(setup, pools);

  if (!ai.enabled) {
    const used = new Set<string>();
    const initial = Object.fromEntries(
      pools.map((p) => [p.key, localQuestions(parseTopic(p), questionsWanted(shell, p.key), used)]),
    );
    const state = createGame(setup, pools, initial);
    const poolInfo = Object.fromEntries(Object.entries(state.poolInfo).map(([k, v]) => [k, { ...v, exhausted: true }]));
    return { ...state, poolInfo };
  }

  const batches = await Promise.all(
    pools.map((p) =>
      fetchTrivia(
        {
          ...parseTopic(p),
          difficulty: setup.options.difficulty,
          count: Math.min(FIRST_BATCH, questionsWanted(shell, p.key)),
          exclude: [],
          accessCode: ai.accessCode,
        },
        signal,
      ),
    ),
  );
  return createGame(setup, pools, Object.fromEntries(pools.map((p, i) => [p.key, batches[i]])));
}
