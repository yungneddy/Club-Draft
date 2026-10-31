import type { Question } from '../types';

// Each flag is its own asset file (see build.assetsInlineLimit in vite.config.ts).
const FILES = import.meta.glob<string>('../../node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

export function flagUrl(code: string): string | undefined {
  return URLS.get(code);
}

/** Starts downloading the flags of upcoming questions so they appear instantly. */
export function preloadFlags(questions: Question[]): void {
  for (const q of questions) {
    for (const code of [q.flag, ...(q.options ?? []).map((o) => o.flag)]) {
      const url = code && flagUrl(code);
      if (url) new Image().src = url;
    }
  }
}
