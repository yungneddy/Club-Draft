export type Rand = () => number;

export function shuffle<T>(items: readonly T[], rand: Rand = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample<T>(items: readonly T[], n: number, rand: Rand = Math.random): T[] {
  return shuffle(items, rand).slice(0, n);
}

export function pick<T>(items: readonly T[], rand: Rand = Math.random): T {
  return items[Math.floor(rand() * items.length)];
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Lower-cased, accent- and punctuation-free text for duplicate checks. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
