// Writes trivia questions with Claude. Shared by the Vercel function (api/trivia.ts)
// and the Vite dev/preview server (vite.config.ts), both of which speak Request/Response.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const MODEL = 'claude-opus-5-5';

export const TriviaRequestSchema = z.object({
  topic: z.string().trim().max(300).default(''),
  interests: z.string().trim().max(300).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  count: z.number().int().min(1).max(15),
  exclude: z.array(z.string().max(400)).max(200).default([]),
});
export type TriviaRequest = z.infer<typeof TriviaRequestSchema>;

const GeneratedQuestion = z.object({
  question: z.string(),
  answer: z.string(),
  hint: z.string(),
  wrong_options: z.array(z.string()),
  fun_fact: z.string(),
});
const GeneratedBatch = z.object({ questions: z.array(GeneratedQuestion) });

/** What the browser receives. */
export interface TriviaQuestionDTO {
  question: string;
  answer: string;
  hint: string;
  wrongOptions: string[];
  funFact: string;
}

export type TriviaErrorCode = 'not_configured' | 'unauthorized' | 'bad_request' | 'refused' | 'failed';

const SYSTEM_PROMPT = `You write questions for Club Draft, a trivia game friends play in person on one phone. The player answers out loud and the group taps Correct or Wrong, so every question needs one clear answer a friend can judge instantly.

Rules for every question:
- The answer is short: a name, number, place or a few words.
- Only use facts you are certain of and that will not change. Skip "current" holders, recent records, and anything near or after your knowledge cutoff.
- The question must work without options, because it is often asked open-ended. Never write "Which of the following".
- hint: narrows it down without giving the answer away. Avoid the first letter unless nothing better exists.
- wrong_options: exactly 3 plausible but definitely wrong answers in the same style as the answer, used in multiple-choice mode.
- fun_fact: one short sentence of extra context, shown after the answer.
- Cover different sub-topics and question styles, and give no two questions the same answer.
- Keep it fun and party-friendly. Questions about public figures are fine; nothing about private individuals.

Difficulty guide: easy = most people in a pub would know it; medium = a fan of the topic would know it; hard = deep cuts for real enthusiasts; mixed = roughly a third of each.`;

function buildPrompt(req: TriviaRequest): string {
  const lines = [`Write ${req.count} trivia questions.`, ''];
  lines.push(`Topic: <topic>${req.topic || 'General knowledge: a broad mix of categories'}</topic>`);
  if (req.interests) {
    lines.push(
      `The player's interests: <interests>${req.interests}</interests>`,
      'Lean the questions towards these interests where they fit the topic. If the topic is general knowledge, base the questions on these interests.',
    );
  }
  lines.push(`Difficulty: ${req.difficulty}`);
  lines.push('If the topic is vague or playful, interpret it generously.');
  if (req.exclude.length) {
    lines.push('', 'These questions were already used this game. Do not repeat or closely paraphrase them:');
    for (const q of req.exclude) lines.push(`- ${q}`);
  }
  return lines.join('\n');
}

class TriviaError extends Error {
  constructor(
    readonly code: TriviaErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function clean(q: z.infer<typeof GeneratedQuestion>): TriviaQuestionDTO | null {
  const question = q.question.trim();
  const answer = q.answer.trim();
  if (!question || !answer) return null;
  const seen = new Set([answer.toLowerCase()]);
  const wrongOptions = q.wrong_options
    .map((o) => o.trim())
    .filter((o) => {
      const key = o.toLowerCase();
      if (!o || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  return { question, answer, hint: q.hint.trim(), wrongOptions, funFact: q.fun_fact.trim() };
}

export async function generateTrivia(req: TriviaRequest, apiKey: string): Promise<TriviaQuestionDTO[]> {
  // The browser retries on failure, so keep a single attempt here and stay inside the function time limit.
  const client = new Anthropic({ apiKey, timeout: 100_000, maxRetries: 0 });
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Recall-heavy, latency-sensitive work: low effort keeps players from waiting.
    output_config: { effort: 'low', format: betaZodOutputFormat(GeneratedBatch) },
    // If a safety classifier declines (e.g. a chemistry topic), retry on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(req) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new TriviaError('refused', "Claude won't write questions on that topic. Try a different one.", 422);
  }
  const batch = response.parsed_output;
  if (!batch) throw new TriviaError('failed', 'Claude returned questions in an unexpected format.', 502);
  return batch.questions.map(clean).filter((q): q is TriviaQuestionDTO => q !== null);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function errorResponse(code: TriviaErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

/** GET: is the question writer available? POST: write questions. */
export async function handleTriviaRequest(request: Request, env: NodeJS.ProcessEnv = process.env): Promise<Response> {
  const apiKey = env.ANTHROPIC_API_KEY;
  const accessCode = env.TRIVIA_ACCESS_CODE;

  if (request.method === 'GET') {
    return json({ configured: Boolean(apiKey), accessCodeRequired: Boolean(accessCode) });
  }
  if (request.method !== 'POST') return errorResponse('bad_request', 'Use GET or POST.', 405);

  if (!apiKey) {
    return errorResponse('not_configured', 'ANTHROPIC_API_KEY is not set on the server.', 503);
  }
  if (accessCode && request.headers.get('x-access-code') !== accessCode) {
    return errorResponse('unauthorized', 'Wrong or missing access code.', 401);
  }

  let body: TriviaRequest;
  try {
    body = TriviaRequestSchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', 'Invalid request body.', 400);
  }

  try {
    return json({ questions: await generateTrivia(body, apiKey) });
  } catch (error) {
    if (error instanceof TriviaError) return errorResponse(error.code, error.message, error.status);
    if (error instanceof Anthropic.AuthenticationError) {
      return errorResponse('not_configured', 'The server has an invalid ANTHROPIC_API_KEY.', 503);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse('failed', 'Too many requests right now. Try again in a moment.', 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      return errorResponse('failed', 'The question writer is having trouble. Try again.', 502);
    }
    console.error('Trivia generation failed', error);
    return errorResponse('failed', 'Something went wrong writing questions.', 500);
  }
}
