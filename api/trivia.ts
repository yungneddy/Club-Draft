// Vercel Function: /api/trivia
import { handleTriviaRequest } from '../server/trivia.js';

export function GET(request: Request): Promise<Response> {
  return handleTriviaRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleTriviaRequest(request);
}
