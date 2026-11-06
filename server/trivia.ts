// Writes trivia questions with Claude. Shared by the Vercel function (api/trivia.ts)
// and the Vite dev/preview server (vite.config.ts), both of which speak Request/Response.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { toQuestionDTOs, TRIVIA_INSTRUCTIONS, triviaRequestText, type TriviaQuestionDTO } from '../shared/triviaPrompt.js';

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

export type TriviaErrorCode = 'not_configured' | 'unauthorized' | 'bad_request' | 'refused' | 'failed';

class TriviaError extends Error {
  constructor(
    readonly code: TriviaErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function generateTrivia(req: TriviaRequest, apiKey: string): Promise<TriviaQuestionDTO[]> {
  // The browser retries on failure, so keep a single attempt here and stay inside the function time limit.
  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 });
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Recall-heavy, latency-sensitive work: low effort keeps players from waiting.
    output_config: { effort: 'low', format: betaZodOutputFormat(GeneratedBatch) },
    // If a safety classifier declines (e.g. a chemistry topic), retry on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: TRIVIA_INSTRUCTIONS,
    messages: [{ role: 'user', content: triviaRequestText(req) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new TriviaError('refused', "Questions can't be written on that topic. Try a different one.", 422);
  }
  const batch = response.parsed_output;
  if (!batch) throw new TriviaError('failed', 'The questions came back incomplete. Try again.', 502);
  return toQuestionDTOs(batch.questions);
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
    return errorResponse('not_configured', "Custom topics aren't set up on this server yet.", 503);
  }
  if (accessCode && request.headers.get('x-access-code') !== accessCode) {
    return errorResponse('unauthorized', "That access code didn't work. Check it with your host.", 401);
  }

  let body: TriviaRequest;
  try {
    body = TriviaRequestSchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', "That request wasn't valid. Try again.", 400);
  }

  try {
    return json({ questions: await generateTrivia(body, apiKey) });
  } catch (error) {
    if (error instanceof TriviaError) return errorResponse(error.code, error.message, error.status);
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('ANTHROPIC_API_KEY was rejected');
      return errorResponse('not_configured', "Custom topics aren't available right now. The server's API key was rejected.", 503);
    }
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.PermissionDeniedError) {
      // Retrying won't help: usually the account behind the key has no credits or no access.
      console.error('Claude API refused the request', error.status, error.message);
      return errorResponse(
        'not_configured',
        "Claude can't write questions with this server's API key. Check the account's credits and billing at console.anthropic.com.",
        503,
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse('failed', "It's busy right now. Try again in a moment.", 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      return errorResponse('failed', "The questions couldn't be written just now. Try again.", 502);
    }
    console.error('Trivia generation failed', error);
    return errorResponse('failed', 'Something went wrong. Try again.', 500);
  }
}
