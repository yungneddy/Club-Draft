import { describe, expect, it } from 'vitest';
import { handleTriviaRequest } from './trivia';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/trivia', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('handleTriviaRequest', () => {
  it('reports whether Claude is configured', async () => {
    const res = await handleTriviaRequest(new Request('http://localhost/api/trivia'), { TRIVIA_ACCESS_CODE: 'x' });
    expect(await res.json()).toEqual({ configured: false, accessCodeRequired: true });
  });

  it('refuses to generate without an API key', async () => {
    const res = await handleTriviaRequest(post({ topic: 'Cats', count: 5 }), {});
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('not_configured');
  });

  it('checks the access code before calling Claude', async () => {
    const env = { ANTHROPIC_API_KEY: 'sk-test', TRIVIA_ACCESS_CODE: 'pints' };
    const res = await handleTriviaRequest(post({ topic: 'Cats', count: 5 }, { 'x-access-code': 'nope' }), env);
    expect(res.status).toBe(401);
  });

  it('rejects invalid requests', async () => {
    const res = await handleTriviaRequest(post({ topic: 'Cats', count: 500 }), { ANTHROPIC_API_KEY: 'sk-test' });
    expect(res.status).toBe(400);
  });
});
