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

// Jewel tones: distinct from each other and from the gold accent.
export const PLAYER_COLORS = [
  '#ef7f9a',
  '#6aa8ff',
  '#e9b35a',
  '#4fc79a',
  '#a98bff',
  '#ff9466',
  '#4ccfd8',
  '#c3d36a',
  '#f29fd4',
  '#a7b4c8',
];

export function newPlayer(index: number): Player {
  return { id: uid(), name: `Player ${index + 1}`, interests: '', color: PLAYER_COLORS[index % PLAYER_COLORS.length] };
}

export function defaultPlayers(): Player[] {
  return [newPlayer(0), newPlayer(1)];
}

/** What appears on the home screen. Trivia comes in a sober and a drinking edition. */
export type GameId = 'trivia' | 'drinking-trivia' | 'flags' | 'geography';

export interface GameEntry {
  id: GameId;
  kind: GameKind;
  title: string;
  tagline: string;
  /** `true`/`false` fixes drinking rules on/off; `undefined` leaves it to the players. */
  drinking?: boolean;
}

export const GAMES: Record<GameId, GameEntry> = {
  trivia: {
    id: 'trivia',
    kind: 'trivia',
    title: 'Trivia',
    tagline: 'Name any topic. Fresh questions, nothing but bragging rights.',
    drinking: false,
  },
  'drinking-trivia': {
    id: 'drinking-trivia',
    kind: 'trivia',
    title: 'Drinking Trivia',
    tagline: 'Same questions, higher stakes. Wrong answers cost a sip.',
    drinking: true,
  },
  flags: { id: 'flags', kind: 'flags', title: 'Flags', tagline: '197 flags. Name them, or spot them in a line-up.' },
  geography: { id: 'geography', kind: 'geography', title: 'Geography', tagline: 'Capitals, borders and bragging rights.' },
};

export const GAME_ORDER: GameId[] = ['trivia', 'drinking-trivia', 'flags', 'geography'];

export function gameIdOf(setup: GameSetup): GameId {
  if (setup.kind === 'trivia') return setup.settings.drinking ? 'drinking-trivia' : 'trivia';
  return setup.kind;
}

const BASE_SETTINGS: GameSettings = {
  rounds: 3,
  questionsPerRound: 5,
  passesPerRound: 2,
  hintsPerRound: 2,
  answerMode: 'reveal',
  drinking: false,
  wrongSips: 1,
};

export const DEFAULT_SETTINGS: Record<GameId, GameSettings> = {
  trivia: BASE_SETTINGS,
  'drinking-trivia': { ...BASE_SETTINGS, drinking: true },
  flags: { ...BASE_SETTINGS, answerMode: 'choice' },
  geography: { ...BASE_SETTINGS, answerMode: 'choice' },
};

export const DEFAULT_TRIVIA: TriviaOptions = { topic: '', difficulty: 'mixed' };
export const DEFAULT_FLAGS: FlagOptions = { region: 'world', difficulty: 'medium', style: 'mix' };
export const DEFAULT_GEO: GeoOptions = {
  region: 'world',
  difficulty: 'medium',
  types: ['capital', 'capitalOf', 'neighbour', 'bigger', 'continent', 'landlocked'],
};

export function gameTitle(setup: GameSetup): string {
  if (setup.kind === 'trivia') return setup.options.topic.trim() || 'General knowledge';
  return GAMES[setup.kind].title;
}

/** Flags and geography are generated on the device, all at once. */
export function startCountryGame(setup: Extract<GameSetup, { kind: 'flags' | 'geography' }>): GameState {
  const pool = { key: 'main', label: GAMES[setup.kind].title, topic: '', playerIds: setup.players.map((p) => p.id), source: 'local' as const };
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
