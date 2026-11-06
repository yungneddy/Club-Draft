import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import { handleTriviaRequest } from './server/trivia.ts';

/** Serves /api/trivia from `npm run dev` and `npm run preview`, mirroring the Vercel function. */
function triviaApi(env: NodeJS.ProcessEnv): Plugin {
  const middleware: Connect.NextHandleFunction = async (req: Connect.IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(new URL(req.originalUrl ?? '/api/trivia', 'http://localhost'), {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]): [string, string][] => (typeof v === 'string' ? [[k, v]] : [])),
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

/** The artifact host supplies the document skeleton, so the page keeps only its title, assets and root. */
function artifactPage(): Plugin {
  return {
    name: 'troops-trivia-artifact-page',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<!doctype html>|<\/?html[^>]*>|<\/?head>|<\/?body>/gi, '')
          .replace(/<meta [^>]*>|<link rel="(icon|manifest|apple-touch-icon)"[^>]*>/gi, '')
          .replace(/\n\s*\n/g, '\n')
          .trim() + '\n',
    },
  };
}

// `--mode artifact` builds for publishing as a Claude artifact: relative paths, fonts embedded
// (the host only loads fonts from Google Fonts or data: URIs) and the page reduced by artifactPage().
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: artifact ? './' : '/',
    plugins: [react(), triviaApi({ ...process.env, ...loadEnv(mode, process.cwd(), '') }), artifact && artifactPage()],
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      // Keep each flag as its own file so only the flags you see get downloaded.
      assetsInlineLimit: (file) => {
        if (file.includes('flag-icons')) return false;
        if (artifact && file.endsWith('.woff2')) return true;
        return undefined;
      },
    },
    server: { host: true },
    preview: { host: true },
  };
});
