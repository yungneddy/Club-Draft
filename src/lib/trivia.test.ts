import { describe, expect, it } from 'vitest';
import { TRIVIA_BANK } from '../data/triviaBank';
import { questionKey } from './engine';
import { bankQuestions, localQuestions, parseTopic, triviaPools } from './trivia';

const player = (id: string, interests = '') => ({ id, name: id, interests, color: '#fff' });

describe('triviaPools', () => {
  it('shares a pool between players with the same interests', () => {
    const pools = triviaPools([player('a'), player('b'), player('c', 'Formula 1')], { topic: 'Sport', difficulty: 'mixed' }, 'ai');
    expect(pools).toHaveLength(2);
    expect(pools[0].playerIds).toEqual(['a', 'b']);
    expect(parseTopic(pools[1])).toEqual({ topic: 'Sport', interests: 'Formula 1' });
    expect(pools[1].label).toBe('Sport · Formula 1');
  });
});

describe('built-in bank', () => {
  it('has well-formed entries', () => {
    for (const category of TRIVIA_BANK) {
      for (const [prompt, answer, hint, wrong] of category.questions) {
        expect(prompt && answer && hint).toBeTruthy();
        expect(new Set([answer, ...wrong]).size, prompt).toBe(4);
      }
    }
  });

  it('puts questions matching the topic first', () => {
    const qs = bankQuestions({ topic: '90s movies', interests: '' });
    expect(qs.slice(0, 12).every((q) => q.category === 'Movies & TV')).toBe(true);
  });

  it('matches player interests too', () => {
    const qs = bankQuestions({ topic: '', interests: 'cocktails and beer' });
    expect(qs[0].category).toBe('Food & drink');
  });

  it('adds geography questions for geography topics', () => {
    const qs = bankQuestions({ topic: 'world capitals', interests: '' });
    expect(qs.slice(0, 20).some((q) => q.category?.startsWith('Geography'))).toBe(true);
  });

  it('never repeats a used question and pads with geography when the bank runs dry', () => {
    const used = new Set<string>();
    const first = localQuestions({ topic: 'music', interests: '' }, 100, used);
    const second = localQuestions({ topic: 'music', interests: '' }, 100, used);
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(100);
    const keys = [...first, ...second].map(questionKey);
    expect(new Set(keys).size).toBe(200);
  });
});
