import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import { handleTriviaRequest } from './server/trivia';

/** Serves /api/trivia from `npm run dev` and `npm run preview`, mirroring the Vercel function. */
function triviaApi(env: NodeJS.ProcessEnv): Plugin {
  const middleware: Connect.NextHandleFunction = async (req: Connect.IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(new URL(req.originalUrl ?? '/api/trivia', 'http://localhost'), {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const response = await handleTriviaRequest(request, env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  return {
    name: 'troops-trivia-api',
    configureServer: (server) => void server.middlewares.use('/api/trivia', middleware),
    configurePreviewServer: (server) => void server.middlewares.use('/api/trivia', middleware),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), triviaApi({ ...process.env, ...loadEnv(mode, process.cwd(), '') })],
  build: {
    // Keep each flag as its own file so only the flags you see get downloaded.
    assetsInlineLimit: (file) => (file.includes('flag-icons') ? false : undefined),
  },
  server: { host: true },
  preview: { host: true },
}));
