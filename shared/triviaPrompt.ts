// The trivia-writing prompt, shared by the server route (server/trivia.ts) and the
// in-page path used when the app runs as a Claude artifact (src/lib/trivia.ts).

export const TRIVIA_INSTRUCTIONS = `You write questions for Troops Trivia, a trivia game friends play in person on one phone. The player answers out loud and the group taps Correct or Wrong, so every question needs one clear answer a friend can judge instantly.

Rules for every question:
- The answer is short: a name, number, place or a few words.
- Only use facts you are certain of and that will not change. Skip "current" holders, recent records, and anything near or after your knowledge cutoff.
- The question must work without options, because it is often asked open-ended. Never write "Which of the following".
- hint: narrows it down without giving the answer away. Avoid the first letter unless nothing better exists.
- wrong_options: exactly 3 plausible but definitely wrong answers in the same style as the answer, used in multiple-choice mode.
- fun_fact: one short sentence of extra context, shown after the answer.
- Cover different sub-topics and question styles, and give no two questions the same answer.
- Keep it fun and party-friendly. Questions about public figures are fine; nothing about private individuals.

Difficulty guide: easy = most people in a pub would know it; medium = a fan of the topic would know it; hard = deep cuts for real enthusiasts; mixed = roughly a third of each.`;

/** How to reply when the answer can't be constrained by structured outputs (the in-page path). */
export const TRIVIA_JSON_FORMAT = `Reply with only JSON in this shape:
{"questions": [{"question": "…", "answer": "…", "hint": "…", "wrong_options": ["…", "…", "…"], "fun_fact": "…"}]}`;

export interface TriviaPromptInput {
  topic: string;
  interests: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  count: number;
  exclude: string[];
}

export function triviaRequestText(req: TriviaPromptInput): string {
  const lines = [`Write ${req.count} trivia questions.`, ''];
  lines.push(`Topic: <topic>${req.topic || 'General knowledge: a broad mix of categories'}</topic>`);
  if (req.interests) {
    lines.push(
      `The player's interests: <interests>${req.interests}</interests>`,
      'Lean the questions towards these interests where they fit the topic. If the topic is general knowledge, base the questions on these interests.',
    );
  }
  lines.push(`Difficulty: ${req.difficulty}`);
  lines.push('If the topic is vague or playful, interpret it generously.');
  if (req.exclude.length) {
    lines.push('', 'These questions were already used this game. Do not repeat or closely paraphrase them:');
    for (const q of req.exclude) lines.push(`- ${q}`);
  }
  return lines.join('\n');
}

/** What the browser works with. */
export interface TriviaQuestionDTO {
  question: string;
  answer: string;
  hint: string;
  wrongOptions: string[];
  funFact: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Keeps well-formed questions and tidies their wrong options. Accepts untrusted JSON. */
export function toQuestionDTOs(raw: unknown): TriviaQuestionDTO[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q): TriviaQuestionDTO[] => {
    if (!q || typeof q !== 'object') return [];
    const r = q as Record<string, unknown>;
    const question = text(r.question);
    const answer = text(r.answer);
    if (!question || !answer) return [];
    const seen = new Set([answer.toLowerCase()]);
    const wrongOptions = (Array.isArray(r.wrong_options) ? r.wrong_options : [])
      .map(text)
      .filter((o) => {
        const key = o.toLowerCase();
        if (!o || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
    return [{ question, answer, hint: text(r.hint), wrongOptions, funFact: text(r.fun_fact) }];
  });
}
