import { TRIVIA_BANK, type BankEntry } from '../data/triviaBank';
import type { Player, Question, TriviaDifficulty, TriviaOptions } from '../types';
import { geoQuestions } from './countryQuiz';
import { questionKey, type PoolDef } from './engine';
import { normalize, shuffle, uid, type Rand } from './random';

// ---------------------------------------------------------------------------- Pools

export interface TriviaTopic {
  topic: string;
  interests: string;
}

/** Players with the same topic and interests share a question queue so they never get the same question twice. */
export function triviaPools(players: Player[], options: TriviaOptions, source: PoolDef['source']): PoolDef[] {
  const pools = new Map<string, PoolDef>();
  for (const p of players) {
    const topic = options.topic.trim();
    const interests = p.interests.trim();
    const key = `${normalize(topic)}|${normalize(interests)}`;
    const existing = pools.get(key);
    if (existing) {
      existing.playerIds.push(p.id);
      continue;
    }
    pools.set(key, {
      key,
      label: [topic || 'General knowledge', interests].filter(Boolean).join(' · '),
      topic: JSON.stringify({ topic, interests } satisfies TriviaTopic),
      playerIds: [p.id],
      source,
    });
  }
  return [...pools.values()];
}

export function parseTopic(pool: PoolDef | { topic: string }): TriviaTopic {
  return JSON.parse(pool.topic) as TriviaTopic;
}

// ---------------------------------------------------------------------------- Built-in bank

const GEO_KEYWORDS = ['geograph', 'country', 'countries', 'capital', 'flag', 'continent', 'world', 'map', 'travel'];

function matches(text: string, keyword: string): boolean {
  return ` ${normalize(text)} `.includes(` ${normalize(keyword)}`);
}

function fromBank([prompt, answer, hint, wrong, funFact]: BankEntry, category: string, rand: Rand): Question {
  return {
    id: uid(),
    category,
    prompt,
    answer,
    hint,
    options: shuffle([answer, ...wrong], rand).map((label) => ({ label })),
    funFact,
  };
}

/** Built-in questions, best matches for the topic first, then everything else. */
export function bankQuestions({ topic, interests }: TriviaTopic, rand: Rand = Math.random): Question[] {
  const text = `${topic} ${interests}`;
  const toQuestions = (categories: typeof TRIVIA_BANK) =>
    categories.flatMap((c) => c.questions.map((q) => fromBank(q, c.name, rand)));
  const hit = TRIVIA_BANK.filter((c) => c.keywords.some((k) => matches(text, k)));
  const rest = TRIVIA_BANK.filter((c) => !hit.includes(c));
  const best = toQuestions(hit);
  if (GEO_KEYWORDS.some((k) => matches(text, k))) best.push(...geography(30, rand));
  return [...shuffle(best, rand), ...shuffle(toQuestions(rest), rand)];
}

function geography(count: number, rand: Rand): Question[] {
  return geoQuestions({ region: 'world', difficulty: 'medium', types: [] }, 'choice', count, rand).map((q) => ({
    ...q,
    category: `Geography · ${q.category}`,
  }));
}

/** `count` built-in questions not yet used this game, padded with geography questions if the bank runs dry. */
export function localQuestions(topic: TriviaTopic, count: number, used: Set<string>, rand: Rand = Math.random): Question[] {
  const out: Question[] = [];
  const take = (qs: Question[]) => {
    for (const q of qs) {
      const key = questionKey(q);
      if (out.length >= count || used.has(key)) continue;
      used.add(key);
      out.push(q);
    }
  };
  take(bankQuestions(topic, rand));
  for (let tries = 0; out.length < count && tries < 5; tries++) take(geography(count - out.length + 10, rand));
  return out;
}

// ---------------------------------------------------------------------------- Claude

export interface AiStatus {
  configured: boolean;
  accessCodeRequired: boolean;
}

export type TriviaApiErrorCode = 'not_configured' | 'unauthorized' | 'bad_request' | 'refused' | 'failed' | 'network';

export class TriviaApiError extends Error {
  constructor(
    readonly code: TriviaApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** `null` when there is no /api/trivia at all (e.g. a static host). */
export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch('/api/trivia');
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as AiStatus;
  } catch {
    return null;
  }
}

interface QuestionDTO {
  question: string;
  answer: string;
  hint: string;
  wrongOptions: string[];
  funFact: string;
}

export interface TriviaRequest extends TriviaTopic {
  difficulty: TriviaDifficulty;
  count: number;
  exclude: string[];
  accessCode?: string;
}

export async function fetchTrivia(req: TriviaRequest, signal?: AbortSignal, rand: Rand = Math.random): Promise<Question[]> {
  const { accessCode, ...body } = req;
  let res: Response;
  try {
    res = await fetch('/api/trivia', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(accessCode ? { 'x-access-code': accessCode } : {}) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new TriviaApiError('network', "You seem to be offline. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as
    | { questions: QuestionDTO[] }
    | { error: { code: TriviaApiErrorCode; message: string } }
    | null;
  if (!res.ok || !data || 'error' in data) {
    const error = data && 'error' in data ? data.error : null;
    throw new TriviaApiError(error?.code ?? 'failed', error?.message ?? 'Something went wrong. Try again.');
  }
  return data.questions.map((q) => ({
    id: uid(),
    prompt: q.question,
    answer: q.answer,
    hint: q.hint,
    funFact: q.funFact || undefined,
    // Without three wrong answers there's no fair multiple choice; the game falls back to reveal for that question.
    options: q.wrongOptions.length >= 3 ? shuffle([q.answer, ...q.wrongOptions], rand).map((label) => ({ label })) : undefined,
  }));
}
