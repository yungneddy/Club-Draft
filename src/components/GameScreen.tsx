import { useEffect, useState, type CSSProperties, type Dispatch } from 'react';
import {
  accuracy,
  currentPlayer,
  hintsLeft,
  isLastTurnOfRound,
  nextPlayer,
  passesLeft,
  questionNumber,
  standings,
  type DrinkCall,
  type GameAction,
  type GameState,
  type TurnResult,
} from '../lib/engine';
import { preloadFlags } from '../lib/flags';
import { gameTitle } from '../lib/setup';
import type { Player, Question } from '../types';
import { Flag } from './controls';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  notice: string | null;
  onQuit: () => void;
  onRematch: () => void;
  onChangeSetup: () => void;
}

const playerStyle = (p: Player) => ({ '--player': p.color }) as CSSProperties;

export function GameScreen(props: Props) {
  const { state, dispatch, notice, onQuit, onRematch, onChangeSetup } = props;
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => {
    preloadFlags(Object.values(state.pools).flatMap((pool) => pool.slice(0, 2)));
  }, [state.pools]);

  let body;
  if (state.phase === 'roundEnd') body = <RoundSummary state={state} onNext={() => dispatch({ type: 'nextRound' })} />;
  else if (state.phase === 'finished') body = <FinalResults state={state} onRematch={onRematch} onChangeSetup={onChangeSetup} onHome={onQuit} />;
  else body = <Turn state={state} dispatch={dispatch} />;

  return (
    <div className="screen game">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label={state.phase === 'finished' ? 'Home' : 'Quit game'}
          onClick={() => (state.phase === 'finished' ? onQuit() : setConfirmQuit(true))}
        >
          ✕
        </button>
        <div className="topbar-title">
          <div className="topbar-game">{gameTitle(state.setup)}</div>
          <div className="muted small">
            Round {state.round} of {state.setup.settings.rounds}
            {state.setup.settings.drinking && ' · 🍺 Drinking mode'}
          </div>
        </div>
        <span className="topbar-spacer" />
      </header>

      {notice && <div className="notice">{notice}</div>}
      {body}

      {confirmQuit && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="overlay-card">
            <h2>End this game?</h2>
            <p className="muted">Scores won't be saved.</p>
            <div className="stack">
              <button type="button" className="btn btn-bad" onClick={onQuit}>
                End game
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmQuit(false)}>
                Keep playing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Scoreboard({ state, active }: { state: GameState; active?: string }) {
  return (
    <ol className="scoreboard" aria-label="Scores">
      {state.setup.players.map((p) => (
        <li key={p.id} className={p.id === active ? 'active' : ''} style={playerStyle(p)}>
          <span className="sb-name">{p.name}</span>
          <span className="sb-score">{state.stats[p.id].score}</span>
        </li>
      ))}
    </ol>
  );
}

function Turn({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const player = currentPlayer(state);
  const stats = state.stats[player.id];
  const { settings, players } = state.setup;
  const q = state.current;
  const feedback = state.phase === 'feedback' ? state.last : null;
  const toast = usePassToast(state);

  return (
    <>
      {players.length > 1 && <Scoreboard state={state} active={player.id} />}

      <div className="turn-banner" style={playerStyle(player)}>
        <span className="turn-name">{players.length > 1 ? `${player.name}'s turn` : player.name}</span>
        <span className="turn-meta">
          {stats.streak >= 2 && <span className="streak">🔥 {stats.streak}</span>}
          Q{questionNumber(state)}/{settings.questionsPerRound}
        </span>
      </div>

      {q ? (
        <QuestionCard key={q.id} state={state} question={q} feedback={feedback} dispatch={dispatch} />
      ) : (
        <div className="turn-scroll">
          <Waiting state={state} dispatch={dispatch} />
        </div>
      )}

      {toast && state.phase === 'question' && state.last?.outcome === 'pass' && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

/** A brief "passed – it was X" note, since passing skips straight to the next question. */
function usePassToast(state: GameState): string | null {
  const [toast, setToast] = useState<string | null>(null);
  const { last, seq } = state;
  useEffect(() => {
    if (!last || last.outcome !== 'pass') return;
    const name = state.setup.players.find((p) => p.id === last.playerId)?.name ?? '';
    const drink = last.drinks.map((d) => ` · 🍺 ${d.sips} sip`).join('');
    setToast(`${name} passed. It was: ${last.question.answer}${drink}`);
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
    // Only react to new outcomes, not every state change.
  }, [seq]);
  return toast;
}

function Waiting({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pool = state.poolInfo[state.poolOf[currentPlayer(state).id]];
  if (pool?.exhausted) {
    return (
      <div className="card center">
        <div className="big-emoji" aria-hidden>
          🫗
        </div>
        <h2>Out of questions</h2>
        <p className="muted">That's every question we had for this topic.</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'finish' })}>
          See the results
        </button>
      </div>
    );
  }
  return (
    <div className="card center">
      <div className="spinner" aria-hidden />
      <p className="muted">Writing more questions…</p>
    </div>
  );
}

function QuestionCard(props: { state: GameState; question: Question; feedback: TurnResult | null; dispatch: Dispatch<GameAction> }) {
  const { state, question: q, feedback, dispatch } = props;
  const { settings } = state.setup;
  const choice = settings.answerMode === 'choice' && Boolean(q.options?.length);
  const showHint = state.hintShown || feedback?.usedHint;
  const removed = new Set(state.hintShown && !feedback ? q.hintRemoves : []);
  const hints = hintsLeft(state);
  const passes = passesLeft(state);
  const flagOptions = q.options?.some((o) => o.flag);
  const twoColumns = flagOptions || q.options?.every((o) => o.label.length <= 14);

  return (
    <>
      <div className="turn-scroll">
        <article className={`question-card ${feedback ? `is-${feedback.outcome}` : ''}`}>
          {q.category && <div className="category">{q.category}</div>}
          {q.flag && <Flag code={q.flag} className="flag-hero" />}
          <h2 className="prompt">{q.prompt}</h2>

          {showHint && <div className="hint">💡 {q.hint}</div>}

          {choice && (
            <div className={`options ${flagOptions ? 'options-flags' : ''} ${twoColumns ? 'options-two' : ''}`}>
              {q.options!.map((o, i) => {
                let cls = '';
                if (feedback) {
                  if (o.label === q.answer) cls = 'correct';
                  else if (o.label === feedback.picked) cls = 'wrong';
                  else cls = 'dim';
                } else if (removed.has(o.label)) cls = 'removed';
                return (
                  <button
                    key={o.label}
                    type="button"
                    className={`option ${cls}`}
                    disabled={Boolean(feedback) || removed.has(o.label)}
                    aria-label={o.flag ? (feedback ? o.label : `Flag option ${i + 1}`) : undefined}
                    onClick={() => dispatch({ type: 'answer', correct: o.label === q.answer, picked: o.label })}
                  >
                    {o.flag ? (
                      <>
                        <Flag code={o.flag} alt={feedback ? o.label : `Flag option ${i + 1}`} />
                        {feedback && <span className="option-caption">{o.label}</span>}
                      </>
                    ) : (
                      o.label
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!choice &&
            (state.revealed || feedback ? (
              <div className="answer">
                <div className="answer-label">Answer</div>
                <div className="answer-text">{q.answer}</div>
                {q.acceptAlso?.length ? <div className="muted small">Also accept: {q.acceptAlso.join(', ')}</div> : null}
              </div>
            ) : (
              <button type="button" className="reveal" onClick={() => dispatch({ type: 'reveal' })}>
                👀 Tap to reveal the answer
              </button>
            ))}

          {feedback && q.funFact && <p className="fun-fact">{q.funFact}</p>}
        </article>
      </div>

      {feedback ? (
        <Feedback state={state} result={feedback} dispatch={dispatch} />
      ) : (
        <div className="action-bar">
          <div className="action-row">
            <button
              type="button"
              className="btn btn-hint"
              disabled={hints <= 0 || state.hintShown || state.revealed}
              onClick={() => dispatch({ type: 'hint' })}
            >
              💡 Hint <span className="count">{hints}</span>
            </button>
            <button type="button" className="btn btn-pass" disabled={passes <= 0 || state.revealed} onClick={() => dispatch({ type: 'pass' })}>
              ⏭ Pass <span className="count">{passes}</span>
            </button>
          </div>
          {!choice && (
            <div className="action-row">
              <button type="button" className="btn btn-bad btn-xl" onClick={() => dispatch({ type: 'answer', correct: false })}>
                ✗ Wrong
              </button>
              <button type="button" className="btn btn-good btn-xl" onClick={() => dispatch({ type: 'answer', correct: true })}>
                ✓ Correct
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DrinkCalls({ calls, name }: { calls: DrinkCall[]; name: string }) {
  if (!calls.length) return null;
  return (
    <div className="drinks">
      {calls.map((d, i) => (
        <div key={i} className={`drink drink-${d.kind}`}>
          {d.kind === 'take'
            ? `🍺 ${name}, take ${d.sips} sip${d.sips === 1 ? '' : 's'}`
            : `🔥 ${d.reason}! ${name}, hand out ${d.sips} sips`}
        </div>
      ))}
    </div>
  );
}

function Feedback({ state, result, dispatch }: { state: GameState; result: TurnResult; dispatch: Dispatch<GameAction> }) {
  const player = currentPlayer(state);
  const correct = result.outcome === 'correct';
  const lastTurn = isLastTurnOfRound(state);
  const finalTurn = lastTurn && state.round >= state.setup.settings.rounds;
  const solo = state.setup.players.length === 1;
  const next = nextPlayer(state);

  let nextLabel = solo ? 'Next question →' : `Pass to ${next.name} →`;
  if (lastTurn) nextLabel = finalTurn ? 'See final results →' : 'See round results →';

  return (
    <div className="feedback">
      <div className={`result ${correct ? 'good' : 'bad'}`} role="status">
        {correct ? (result.streak >= 3 ? `Correct! 🔥 ${result.streak} in a row` : 'Correct! +1') : 'Wrong!'}
      </div>
      <DrinkCalls calls={result.drinks} name={player.name} />
      <div className="action-row">
        <button type="button" className="btn btn-ghost btn-undo" onClick={() => dispatch({ type: 'undo' })}>
          ↩ Undo
        </button>
        <button
          type="button"
          className={`btn btn-grow ${lastTurn || solo ? 'btn-primary' : 'btn-player'}`}
          style={playerStyle(next)}
          onClick={() => dispatch({ type: 'next' })}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function RoundSummary({ state, onNext }: { state: GameState; onNext: () => void }) {
  const rows = standings(state);
  const { settings } = state.setup;
  return (
    <div className="summary">
      <div className="card center">
        <div className="big-emoji" aria-hidden>
          🍻
        </div>
        <h2>Round {state.round} done!</h2>
        <p className="muted">
          {settings.rounds - state.round} round{settings.rounds - state.round === 1 ? '' : 's'} to go. Passes and hints are topped up.
        </p>
      </div>
      <ol className="standings">
        {rows.map(({ player, stats, rank }) => (
          <li key={player.id} style={playerStyle(player)}>
            <span className="rank">{rank}</span>
            <span className="st-name">{player.name}</span>
            <span className="st-round">+{stats.roundScore}</span>
            <span className="st-score">{stats.score}</span>
          </li>
        ))}
      </ol>
      <div className="sticky-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={onNext}>
          Start round {state.round + 1} →
        </button>
      </div>
    </div>
  );
}

function FinalResults(props: { state: GameState; onRematch: () => void; onChangeSetup: () => void; onHome: () => void }) {
  const { state, onRematch, onChangeSetup, onHome } = props;
  const rows = standings(state);
  const { players, settings } = state.setup;
  const winners = rows.filter((r) => r.rank === 1);
  const solo = players.length === 1;
  const asked = settings.rounds * settings.questionsPerRound;

  let headline: string;
  if (solo) headline = `You scored ${rows[0].stats.score} out of ${asked}`;
  else if (winners.length === 1) headline = `${winners[0].player.name} wins!`;
  else headline = `It's a tie between ${winners.map((w) => w.player.name).join(' & ')}!`;

  return (
    <div className="summary">
      <div className="card center celebrate">
        <div className="big-emoji" aria-hidden>
          🏆
        </div>
        <h2>{headline}</h2>
        {!solo && settings.drinking && (
          <p className="muted">{rows[rows.length - 1].player.name} came last, so they're buying the next round. 🍻</p>
        )}
      </div>
      <ol className="standings final">
        {rows.map(({ player, stats, rank }) => {
          const acc = accuracy(stats);
          return (
            <li key={player.id} style={playerStyle(player)}>
              <span className="rank">{rank === 1 ? '👑' : rank}</span>
              <div className="st-body">
                <span className="st-name">{player.name}</span>
                <span className="st-stats">
                  {stats.correct} right · {stats.wrong} wrong{acc !== null && ` · ${Math.round(acc * 100)}%`}
                  {stats.bestStreak >= 2 && ` · best streak ${stats.bestStreak}`}
                  {` · ${stats.hints} hint${stats.hints === 1 ? '' : 's'} · ${stats.passes} pass${stats.passes === 1 ? '' : 'es'}`}
                  {settings.drinking && ` · 🍺 ${stats.sips} sip${stats.sips === 1 ? '' : 's'} taken, ${stats.sipsGiven} given`}
                </span>
              </div>
              <span className="st-score">{stats.score}</span>
            </li>
          );
        })}
      </ol>
      <div className="sticky-actions stack">
        <button type="button" className="btn btn-primary btn-lg" onClick={onRematch}>
          Rematch with new questions
        </button>
        <div className="action-row">
          <button type="button" className="btn" onClick={onChangeSetup}>
            Change setup
          </button>
          <button type="button" className="btn btn-ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
