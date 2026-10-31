import { COUNTRIES } from '../data/countries';
import type {
  AnswerMode,
  Country,
  CountryDifficulty,
  FlagOptions,
  GeoOptions,
  GeoQuestionType,
  Option,
  Question,
  Region,
} from '../types';
import { pick, sample, shuffle, uid, type Rand } from './random';

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
/** Below this many countries a pool is too samey, so difficulty is relaxed. */
const MIN_POOL = 12;

export function regionOf(c: Country): Exclude<Region, 'world'> {
  return c.continent === 'North America' || c.continent === 'South America' ? 'Americas' : c.continent;
}

function inRegion(region: Region): Country[] {
  return region === 'world' ? COUNTRIES : COUNTRIES.filter((c) => regionOf(c) === region);
}

const TIERS: Record<CountryDifficulty, number[][]> = {
  // Each step widens the pool when the region is too small.
  easy: [[1], [1, 2], [1, 2, 3]],
  medium: [[1, 2], [1, 2, 3]],
  hard: [[2, 3], [1, 2, 3]],
  all: [[1, 2, 3]],
};

/** Countries a quiz draws its subjects from. */
export function countryPool(region: Region, difficulty: CountryDifficulty): Country[] {
  const candidates = inRegion(region);
  let pool: Country[] = [];
  for (const tiers of TIERS[difficulty]) {
    pool = candidates.filter((c) => tiers.includes(c.tier));
    if (pool.length >= MIN_POOL) break;
  }
  return pool;
}

/** Up to `n` other countries, preferring look-alikes from the same subregion, then continent. */
function similar(target: Country, n: number, rand: Rand, accept: (c: Country) => boolean = () => true): Country[] {
  const others = COUNTRIES.filter((c) => c.code !== target.code && accept(c));
  const out: Country[] = [];
  for (const group of [
    others.filter((c) => c.subregion === target.subregion),
    others.filter((c) => c.continent === target.continent),
    others,
  ]) {
    for (const c of shuffle(group, rand)) {
      if (out.length >= n) return out;
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}

function options(labels: string[], rand: Rand): Option[] {
  return shuffle(labels, rand).map((label) => ({ label }));
}

function startsWith(text: string): string {
  return `Starts with "${text.charAt(0).toUpperCase()}"`;
}

function formatArea(km2: number): string {
  return `${km2.toLocaleString('en-US')} km²`;
}

/** Cycles through the pool in shuffled order so subjects only repeat once all have been used. */
function cycler(pool: Country[], rand: Rand): () => Country {
  let queue: Country[] = [];
  return () => {
    if (!queue.length) queue = shuffle(pool, rand);
    return queue.pop()!;
  };
}

// ---------------------------------------------------------------------------- Flags

function nameTheFlag(c: Country, rand: Rand): Question {
  return {
    id: uid(),
    category: 'Name the flag',
    prompt: "Which country's flag is this?",
    flag: c.code,
    answer: c.name,
    hint: `It's in ${c.subregion}. ${startsWith(c.name)}.`,
    options: options([c.name, ...similar(c, 3, rand).map((d) => d.name)], rand),
    funFact: c.capital ? `The capital of ${c.name} is ${c.capital}.` : undefined,
  };
}

function findTheFlag(c: Country, rand: Rand): Question {
  const decoys = similar(c, 3, rand);
  return {
    id: uid(),
    category: 'Find the flag',
    prompt: `Which one is the flag of ${c.name}?`,
    answer: c.name,
    // The hint is a 50:50: two decoys fade out, which says it all.
    hint: '',
    hintRemoves: decoys.slice(0, 2).map((d) => d.name),
    options: shuffle([c, ...decoys], rand).map((d) => ({ label: d.name, flag: d.code })),
    funFact: `It's in ${c.subregion}.`,
  };
}

export function flagQuestions(opts: FlagOptions, mode: AnswerMode, count: number, rand: Rand = Math.random): Question[] {
  const next = cycler(countryPool(opts.region, opts.difficulty), rand);
  // "Find the flag" needs options on screen, so it only works in multiple-choice mode.
  const style = mode === 'reveal' ? 'name' : opts.style;
  return Array.from({ length: count }, (_, i) => {
    const c = next();
    const find = style === 'find' || (style === 'mix' && i % 2 === 1);
    return find ? findTheFlag(c, rand) : nameTheFlag(c, rand);
  });
}

// ---------------------------------------------------------------------------- Geography

type GeoMaker = (c: Country, mode: AnswerMode, rand: Rand, pool: Country[]) => Question | null;

const GEO: Record<GeoQuestionType, GeoMaker> = {
  capital(c, _mode, rand) {
    if (!c.capital || c.contestedCapital) return null;
    const decoys = similar(c, 3, rand, (d) => Boolean(d.capital) && !d.contestedCapital);
    return {
      id: uid(),
      category: 'Capitals',
      prompt: `What is the capital of ${c.name}?`,
      answer: c.capital,
      acceptAlso: c.capitalAlso,
      hint: `${startsWith(c.capital)}.`,
      options: options([c.capital, ...decoys.map((d) => d.capital)], rand),
    };
  },

  capitalOf(c, _mode, rand) {
    if (!c.capital || c.contestedCapital) return null;
    return {
      id: uid(),
      category: 'Capitals',
      prompt: `${c.capital} is the capital of which country?`,
      answer: c.name,
      hint: `It's in ${c.subregion}.`,
      options: options([c.name, ...similar(c, 3, rand).map((d) => d.name)], rand),
    };
  },

  continent(c, _mode, rand, pool) {
    // Pointless inside a single-continent quiz, and unfair for countries that span two.
    if (c.transcontinental || new Set(pool.map((p) => p.continent)).size < 3) return null;
    const others = sample(
      CONTINENTS.filter((x) => x !== c.continent),
      3,
      rand,
    );
    return {
      id: uid(),
      category: 'Continents',
      prompt: `Which continent is ${c.name} in?`,
      answer: c.continent,
      hint: c.capital ? `Its capital is ${c.capital}.` : `${startsWith(c.continent)}.`,
      options: options([c.continent, ...others], rand),
    };
  },

  neighbour(c, mode, rand) {
    const neighbours = c.borders.map((code) => BY_CODE.get(code)).filter((n): n is Country => Boolean(n));
    if (!neighbours.length) return null;
    const answer = pick(neighbours, rand);
    if (mode === 'reveal') {
      const others = neighbours.filter((n) => n !== answer).map((n) => n.name);
      return {
        id: uid(),
        category: 'Neighbours',
        prompt: `Name a country that shares a land border with ${c.name}.`,
        answer: answer.name,
        acceptAlso: others,
        hint: `It has ${neighbours.length} land neighbour${neighbours.length === 1 ? '' : 's'}. One is in ${answer.subregion}.`,
      };
    }
    const decoys = similar(c, 3, rand, (d) => !c.borders.includes(d.code));
    return {
      id: uid(),
      category: 'Neighbours',
      prompt: `Which of these countries shares a land border with ${c.name}?`,
      answer: answer.name,
      hint: `${c.name} has ${neighbours.length} land neighbour${neighbours.length === 1 ? '' : 's'}.`,
      hintRemoves: decoys.slice(0, 2).map((d) => d.name),
      options: options([answer.name, ...decoys.map((d) => d.name)], rand),
      funFact: `${c.name} borders ${neighbours.map((n) => n.name).join(', ')}.`,
    };
  },

  bigger(c, _mode, rand, pool) {
    // A rival 1.2x to 4x different in size: close enough to be interesting, far enough to be fair.
    const rivals = pool.filter((d) => {
      const ratio = Math.max(d.area, c.area) / Math.min(d.area, c.area);
      return d.code !== c.code && ratio >= 1.2 && ratio <= 4;
    });
    if (!rivals.length) return null;
    const rival = pick(rivals, rand);
    const [big, small] = c.area > rival.area ? [c, rival] : [rival, c];
    const [first, second] = shuffle([c, rival], rand);
    return {
      id: uid(),
      category: 'Size',
      prompt: `Which is bigger by area: ${first.name} or ${second.name}?`,
      answer: big.name,
      hint: `One is about ${(big.area / small.area).toFixed(1)}× the size of the other.`,
      options: [{ label: first.name }, { label: second.name }],
      funFact: `${big.name}: ${formatArea(big.area)}. ${small.name}: ${formatArea(small.area)}.`,
    };
  },

  landlocked(c, mode, rand, pool) {
    if (mode === 'reveal') {
      return {
        id: uid(),
        category: 'Landlocked',
        prompt: `Is ${c.name} landlocked (no coastline at all)?`,
        answer: c.landlocked ? 'Yes, landlocked' : 'No, it has a coast',
        hint: c.borders.length
          ? `It has ${c.borders.length} land neighbour${c.borders.length === 1 ? '' : 's'}.`
          : 'It has no land neighbours.',
      };
    }
    // Choice mode asks "which of these is landlocked?", using `c` only when it is.
    const candidates = pool.filter((d) => d.landlocked);
    if (!candidates.length) return null;
    const landlocked = c.landlocked ? c : pick(candidates, rand);
    const coastal = similar(landlocked, 3, rand, (d) => !d.landlocked);
    return {
      id: uid(),
      category: 'Landlocked',
      prompt: 'Which of these countries is landlocked?',
      answer: landlocked.name,
      hint: '',
      hintRemoves: coastal.slice(0, 2).map((d) => d.name),
      options: options([landlocked.name, ...coastal.map((d) => d.name)], rand),
      funFact: `${landlocked.name} borders ${landlocked.borders.map((b) => BY_CODE.get(b)?.name).filter(Boolean).join(', ')}.`,
    };
  },
};

export const GEO_TYPES: { type: GeoQuestionType; label: string }[] = [
  { type: 'capital', label: 'Capitals' },
  { type: 'capitalOf', label: 'Capital → country' },
  { type: 'neighbour', label: 'Neighbours' },
  { type: 'bigger', label: 'Bigger or smaller' },
  { type: 'continent', label: 'Continents' },
  { type: 'landlocked', label: 'Landlocked' },
];

export function geoQuestions(opts: GeoOptions, mode: AnswerMode, count: number, rand: Rand = Math.random): Question[] {
  const pool = countryPool(opts.region, opts.difficulty);
  const types = opts.types.length ? opts.types : GEO_TYPES.map((t) => t.type);
  const nextCountry = Object.fromEntries(types.map((t) => [t, cycler(pool, rand)])) as Record<GeoQuestionType, () => Country>;
  const out: Question[] = [];
  let typeQueue: GeoQuestionType[] = [];
  // Some type/country combos can't make a question (no capital, an island with no neighbours…), so allow retries.
  for (let attempts = 0; out.length < count && attempts < count * 20; attempts++) {
    if (!typeQueue.length) typeQueue = shuffle(types, rand);
    const type = typeQueue.pop()!;
    const q = GEO[type](nextCountry[type](), mode, rand, pool);
    if (q) out.push(q);
  }
  return out;
}
