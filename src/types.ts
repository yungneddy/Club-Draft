export type GameKind = 'trivia' | 'flags' | 'geography';

/** `reveal`: answer out loud, then tap Correct/Wrong. `choice`: tap one of four options. */
export type AnswerMode = 'reveal' | 'choice';

export type TriviaDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type CountryDifficulty = 'easy' | 'medium' | 'hard' | 'all';
export type Region = 'world' | 'Europe' | 'Asia' | 'Africa' | 'Americas' | 'Oceania';

export type Continent = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'South America' | 'Oceania';

export interface Country {
  /** ISO 3166-1 alpha-2, lower case (also the flag file name). */
  code: string;
  name: string;
  capital: string;
  capitalAlso?: string[];
  continent: Continent;
  subregion: string;
  area: number;
  landlocked: boolean;
  borders: string[];
  /** 1 = well known, 2 = recognisable, 3 = deep cut. */
  tier: 1 | 2 | 3;
  transcontinental?: boolean;
  contestedCapital?: boolean;
}

export interface Option {
  label: string;
  /** When set, the option is shown as this flag instead of its label. */
  flag?: string;
}

export interface Question {
  id: string;
  prompt: string;
  /** The correct answer; matches the label of one option when `options` is set. */
  answer: string;
  /** Other answers the judge should accept. */
  acceptAlso?: string[];
  /** May be empty when the hint is purely a 50:50 (`hintRemoves`). */
  hint: string;
  /** Option labels struck out when the hint is used (a 50:50). */
  hintRemoves?: string[];
  options?: Option[];
  /** Flag shown above the prompt. */
  flag?: string;
  funFact?: string;
  category?: string;
}

export interface Player {
  id: string;
  name: string;
  /** Trivia only: what this player's questions should be about. */
  interests: string;
  color: string;
}

export interface GameSettings {
  rounds: number;
  /** Questions each player answers per round. */
  questionsPerRound: number;
  /** Per player, reset every round. */
  passesPerRound: number;
  /** Per player, reset every round. */
  hintsPerRound: number;
  answerMode: AnswerMode;
  drinking: boolean;
}

export interface TriviaOptions {
  topic: string;
  difficulty: TriviaDifficulty;
}

export type FlagStyle = 'name' | 'find' | 'mix';

export interface FlagOptions {
  region: Region;
  difficulty: CountryDifficulty;
  style: FlagStyle;
}

export type GeoQuestionType = 'capital' | 'capitalOf' | 'continent' | 'neighbour' | 'bigger' | 'landlocked';

export interface GeoOptions {
  region: Region;
  difficulty: CountryDifficulty;
  types: GeoQuestionType[];
}

export type GameSetup =
  | { kind: 'trivia'; players: Player[]; settings: GameSettings; options: TriviaOptions }
  | { kind: 'flags'; players: Player[]; settings: GameSettings; options: FlagOptions }
  | { kind: 'geography'; players: Player[]; settings: GameSettings; options: GeoOptions };
