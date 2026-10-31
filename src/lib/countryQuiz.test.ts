import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../data/countries';
import type { GeoQuestionType, Question, Region } from '../types';
import { countryPool, flagQuestions, geoQuestions, regionOf } from './countryQuiz';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function expectValidChoice(q: Question) {
  expect(q.options, q.prompt).toBeDefined();
  const labels = q.options!.map((o) => o.label);
  expect(new Set(labels).size, `${q.prompt}: ${labels}`).toBe(labels.length);
  expect(labels).toContain(q.answer);
  for (const removed of q.hintRemoves ?? []) {
    expect(labels).toContain(removed);
    expect(removed).not.toBe(q.answer);
  }
}

describe('country data', () => {
  it('has every UN member plus a few extras, each with a flag code', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(195);
    for (const c of COUNTRIES) expect(c.code).toMatch(/^[a-z]{2}$/);
  });

  it('only lists borders between included countries, symmetrically', () => {
    const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
    for (const c of COUNTRIES) {
      for (const b of c.borders) expect(byCode.get(b)?.borders, `${c.name} -> ${b}`).toContain(c.code);
    }
  });
});

describe('countryPool', () => {
  it('relaxes difficulty when a region is too small', () => {
    expect(countryPool('Oceania', 'easy').length).toBeGreaterThanOrEqual(12);
    expect(countryPool('world', 'easy').every((c) => c.tier === 1)).toBe(true);
    expect(countryPool('Europe', 'easy').every((c) => regionOf(c) === 'Europe')).toBe(true);
  });
});

describe('flagQuestions', () => {
  it('makes valid multiple-choice questions, mixing both styles', () => {
    const qs = flagQuestions({ region: 'world', difficulty: 'all', style: 'mix' }, 'choice', 40, seeded());
    expect(qs).toHaveLength(40);
    qs.forEach(expectValidChoice);
    expect(qs.some((q) => q.flag)).toBe(true);
    expect(qs.some((q) => q.options?.every((o) => o.flag))).toBe(true);
  });

  it('only asks "name the flag" in say-it-out-loud mode', () => {
    const qs = flagQuestions({ region: 'Europe', difficulty: 'medium', style: 'find' }, 'reveal', 20, seeded(2));
    expect(qs.every((q) => q.flag)).toBe(true);
  });

  it('cycles through every country before repeating', () => {
    const pool = countryPool('Oceania', 'all');
    const qs = flagQuestions({ region: 'Oceania', difficulty: 'all', style: 'name' }, 'choice', pool.length * 2, seeded(3));
    expect(new Set(qs.slice(0, pool.length).map((q) => q.answer)).size).toBe(pool.length);
  });
});

describe('geoQuestions', () => {
  const types: GeoQuestionType[] = ['capital', 'capitalOf', 'continent', 'neighbour', 'bigger', 'landlocked'];
  const regions: Region[] = ['world', 'Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];

  it.each(regions)('fills a game for %s in both answer modes', (region) => {
    for (const mode of ['choice', 'reveal'] as const) {
      const qs = geoQuestions({ region, difficulty: 'medium', types }, mode, 30, seeded(region.length));
      expect(qs).toHaveLength(30);
      if (mode === 'choice') qs.forEach(expectValidChoice);
    }
  });

  it('respects the selected question types', () => {
    const qs = geoQuestions({ region: 'world', difficulty: 'all', types: ['capital'] }, 'choice', 20, seeded(4));
    expect(qs.every((q) => q.category === 'Capitals' && q.prompt.startsWith('What is the capital'))).toBe(true);
  });

  it('asks bigger-or-smaller with the right answer', () => {
    const byName = new Map(COUNTRIES.map((c) => [c.name, c]));
    const qs = geoQuestions({ region: 'world', difficulty: 'all', types: ['bigger'] }, 'choice', 20, seeded(5));
    for (const q of qs) {
      const [a, b] = q.options!.map((o) => byName.get(o.label)!);
      expect(q.answer).toBe(a.area > b.area ? a.name : b.name);
    }
  });

  it('only offers real neighbours as the answer, and non-neighbours as decoys', () => {
    const byName = new Map(COUNTRIES.map((c) => [c.name, c]));
    const qs = geoQuestions({ region: 'world', difficulty: 'all', types: ['neighbour'] }, 'choice', 30, seeded(6));
    for (const q of qs) {
      const subject = byName.get(q.prompt.replace('Which of these countries shares a land border with ', '').replace(/\?$/, ''))!;
      for (const o of q.options!) {
        expect(subject.borders.includes(byName.get(o.label)!.code), `${subject.name} / ${o.label}`).toBe(o.label === q.answer);
      }
    }
  });
});
