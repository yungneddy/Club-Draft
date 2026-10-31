import { useEffect, useRef, useState, type Dispatch } from 'react';
import { questionKey, questionsWanted, type GameAction, type GameState } from './engine';
import { BATCH } from './setup';
import { fetchTrivia, localQuestions, parseTopic } from './trivia';

/** Failed requests in a row before a topic switches to the built-in questions. */
const MAX_FAILURES = 2;
const RETRY_MS = 3000;

/**
 * Keeps each trivia pool stocked a few questions ahead of play, asking Claude for more in the background.
 * Returns a notice to show when it had to fall back to built-in questions.
 */
export function useTriviaFeeder(state: GameState | null, dispatch: Dispatch<GameAction>, accessCode: string): string | null {
  const inFlight = useRef(new Set<string>());
  const failures = useRef(new Map<string, number>());
  const [retryTick, setRetryTick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Late responses must not leak into a different game started in the meantime.
  const gameId = useRef(state?.id);
  gameId.current = state?.id;

  useEffect(() => {
    if (!state || state.setup.kind !== 'trivia' || state.phase === 'finished') return;
    const { difficulty } = state.setup.options;

    for (const [pool, info] of Object.entries(state.poolInfo)) {
      if (info.exhausted || inFlight.current.has(pool)) continue;
      const missing = questionsWanted(state, pool) - info.added;
      if (missing <= 0) {
        dispatch({ type: 'markExhausted', pool });
        continue;
      }
      const sharing = Object.values(state.poolOf).filter((p) => p === pool).length;
      if (state.pools[pool].length > sharing * 3 + 2) continue;

      const topic = parseTopic(info);
      const used = new Set(state.asked);
      if (info.source === 'local') {
        dispatch({ type: 'addQuestions', pool, questions: localQuestions(topic, missing, used) });
        dispatch({ type: 'markExhausted', pool });
        continue;
      }

      const id = state.id;
      inFlight.current.add(pool);
      fetchTrivia({ ...topic, difficulty, count: Math.min(BATCH, missing), exclude: state.asked.slice(-150), accessCode })
        .then((questions) => {
          inFlight.current.delete(pool);
          if (gameId.current !== id) return;
          const fresh = questions.filter((q) => !used.has(questionKey(q)));
          if (!fresh.length) throw new Error('No new questions');
          failures.current.delete(pool);
          dispatch({ type: 'addQuestions', pool, questions: fresh });
        })
        .catch(() => {
          inFlight.current.delete(pool);
          if (gameId.current !== id) return;
          const count = (failures.current.get(pool) ?? 0) + 1;
          failures.current.set(pool, count);
          if (count >= MAX_FAILURES) {
            dispatch({ type: 'setPoolSource', pool, source: 'local' });
            setNotice('Connection lost. The rest of this game uses the house questions.');
          } else {
            setTimeout(() => setRetryTick((t) => t + 1), RETRY_MS);
          }
        });
    }
  }, [state, dispatch, accessCode, retryTick]);

  return notice;
}
