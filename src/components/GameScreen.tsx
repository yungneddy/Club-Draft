import {
  ArrowRight,
  Check,
  CircleAlert,
  Crown,
  Eye,
  Flame,
  Hourglass,
  House,
  Lightbulb,
  Martini,
  RotateCcw,
  SkipForward,
  Trophy,
  Undo2,
  Wine,
  X,
} from 'lucide-react';
import { useEffect, useState, type Dispatch, type ReactNode } from 'react';
import {
  accuracy,
  currentPlayer,
  hintsLeft,
  isLastTurnOfRound,
  nextPlayer,
  passesLeft,
  questionNumber,
  ROUND_LOSER_SIPS,
  roundLosers,
  standings,
  type DrinkCall,
  type GameAction,
  type GameState,
  type PlayerStats,
  type TurnResult,
} from '../lib/engine';
import { preloadFlags } from '../lib/flags';
import { haptic } from '../lib/haptics';
import { gameIdOf, GAMES, gameTitle } from '../lib/setup';
import type { Question } from '../types';
import { Avatar, Flag, Medallion, playerStyle } from './controls';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  notice: string | null;
  onQuit: () => void;
  onRematch: () => void;
  onChangeSetup: () => void;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function GameScreen(props: Props) {
  const { state, dispatch, notice, onQuit, onRematch, onChangeSetup } = props;
  const [confirmQuit, setConfirmQuit] = useState(false);
  const { settings } = state.setup;

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
          aria-label={state.phase === 'finished' ? 'Home' : 'End game'}
          onClick={() => (state.phase === 'finished' ? onQuit() : setConfirmQuit(true))}
        >
          <X size={20} />
        </button>
        <div className="topbar-title">
          <h1>{gameTitle(state.setup)}</h1>
          <div className="topbar-sub">
            {state.setup.kind === 'trivia' && `${GAMES[gameIdOf(state.setup)].title} · `}Round {state.round} of {settings.rounds}
          </div>
        </div>
        {settings.drinking ? (
          <span className="drink-pill" title="Drinking rules on" aria-label="Drinking rules on">
            <Wine size={20} strokeWidth={1.75} />
          </span>
        ) : (
          <span />
        )}
      </header>

      {notice && (
        <div className="notice" role="status">
          <CircleAlert size={16} />
          <span>{notice}</span>
        </div>
      )}
      {body}

      {confirmQuit && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="overlay-card">
            <h2 id="quit-title">End this game?</h2>
            <p className="muted">The scores for this game will be lost.</p>
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
          <Avatar player={p} size="sm" />
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
        <Avatar player={player} size="lg" />
        <div className="turn-who">
          <span className="eyebrow">{players.length > 1 ? 'Now playing' : 'Your turn'}</span>
          <span className="turn-name">{player.name}</span>
        </div>
        <div className="turn-meta">
          {stats.streak >= 2 && (
            <span className="streak" aria-label={`${stats.streak} in a row`}>
              <Flame size={14} strokeWidth={2} /> {stats.streak}
            </span>
          )}
          <span className="turn-count" aria-label={`Question ${questionNumber(state)} of ${settings.questionsPerRound}`}>
            {questionNumber(state)}
            <span>/{settings.questionsPerRound}</span>
          </span>
        </div>
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

/** A brief "passed, the answer was X" note, since passing moves straight to a new question. */
function usePassToast(state: GameState): ReactNode {
  const [toast, setToast] = useState<ReactNode>(null);
  const { last, seq } = state;
  useEffect(() => {
    if (!last || last.outcome !== 'pass') return;
    const name = state.setup.players.find((p) => p.id === last.playerId)?.name ?? '';
    const sips = last.drinks.reduce((n, d) => n + d.sips, 0);
    setToast(
      <>
        <span>
          {name} passed. The answer was <strong>{last.question.answer}</strong>.
        </span>
        {sips > 0 && (
          <span className="toast-chip">
            <Wine size={13} /> {plural(sips, 'sip')}
          </span>
        )}
      </>,
    );
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
      <div className="card summary-head">
        <Medallion icon={Hourglass} large />
        <h2>That's every question</h2>
        <p className="muted">You've played every question we have for this topic.</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'finish' })}>
          See final results
        </button>
      </div>
    );
  }
  return (
    <div className="card summary-head">
      <div className="spinner" aria-hidden />
      <p className="muted">Writing the next questions…</p>
    </div>
  );
}

function QuestionCard(props: { state: GameState; question: Question; feedback: TurnResult | null; dispatch: Dispatch<GameAction> }) {
  const { state, question: q, feedback, dispatch } = props;
  const { settings } = state.setup;
  const choice = settings.answerMode === 'choice' && Boolean(q.options?.length);
  const showHint = Boolean(q.hint) && (state.hintShown || feedback?.usedHint);
  const removed = new Set(state.hintShown && !feedback ? q.hintRemoves : []);
  const hints = hintsLeft(state);
  const passes = passesLeft(state);
  const flagOptions = q.options?.some((o) => o.flag);
  const twoColumns = flagOptions || q.options?.every((o) => o.label.length <= 14);

  const answer = (correct: boolean, picked?: string) => {
    haptic(correct ? 12 : [20, 60, 20]);
    dispatch({ type: 'answer', correct, picked });
  };

  return (
    <>
      <div className="turn-scroll">
        <article className={`question-card ${feedback ? `is-${feedback.outcome}` : ''}`}>
          {q.category && <div className="eyebrow category">{q.category}</div>}
          {q.flag && <Flag code={q.flag} className="flag-hero" />}
          <h2 className="prompt">{q.prompt}</h2>

          {showHint && (
            <div className="hint">
              <Lightbulb size={16} />
              <span>{q.hint}</span>
            </div>
          )}

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
                    onClick={() => answer(o.label === q.answer, o.label)}
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
                <div className="eyebrow">Answer</div>
                <div className="answer-text">{q.answer}</div>
                {q.acceptAlso?.length ? <div className="muted small">Also accept: {q.acceptAlso.join(', ')}</div> : null}
              </div>
            ) : (
              <button type="button" className="reveal" onClick={() => dispatch({ type: 'reveal' })}>
                <Eye size={18} /> Reveal answer
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
              <Lightbulb size={18} /> Hint <span className="count">{hints}</span>
            </button>
            <button type="button" className="btn btn-pass" disabled={passes <= 0 || state.revealed} onClick={() => dispatch({ type: 'pass' })}>
              <SkipForward size={18} /> Pass <span className="count">{passes}</span>
            </button>
          </div>
          {!choice && (
            <div className="action-row">
              <button type="button" className="btn btn-bad btn-xl" onClick={() => answer(false)}>
                <X size={22} strokeWidth={2.5} /> Wrong
              </button>
              <button type="button" className="btn btn-good btn-xl" onClick={() => answer(true)}>
                <Check size={22} strokeWidth={2.5} /> Correct
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
      {calls.map((d, i) =>
        d.kind === 'take' ? (
          <div key={i} className="drink drink-take">
            <Wine size={16} />
            <span>
              <strong>{name}</strong> takes {plural(d.sips, 'sip')}
            </span>
          </div>
        ) : (
          <div key={i} className="drink drink-give">
            <Flame size={16} />
            <span>
              {d.reason}. <strong>{name}</strong> hands out {plural(d.sips, 'sip')}
            </span>
          </div>
        ),
      )}
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

  let nextLabel = solo ? 'Next question' : `Next up: ${next.name}`;
  if (lastTurn) nextLabel = finalTurn ? 'Final results' : 'Round results';

  return (
    <div className="feedback">
      <div className={`result ${correct ? 'good' : 'bad'}`} role="status">
        <span className="result-icon" aria-hidden>
          {correct ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}
        </span>
        <span className="result-text">{correct ? 'Correct' : 'Not quite'}</span>
        {correct && <span className="result-chip">+1</span>}
      </div>
      <DrinkCalls calls={result.drinks} name={player.name} />
      <div className="action-row">
        <button type="button" className="btn btn-ghost btn-undo" onClick={() => dispatch({ type: 'undo' })}>
          <Undo2 size={18} /> Undo
        </button>
        <button
          type="button"
          className={`btn btn-grow ${lastTurn || solo ? 'btn-primary' : 'btn-player'}`}
          style={playerStyle(next)}
          onClick={() => {
            haptic();
            dispatch({ type: 'next' });
          }}
        >
          {nextLabel} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function RoundSummary({ state, onNext }: { state: GameState; onNext: () => void }) {
  const rows = standings(state);
  const left = state.setup.settings.rounds - state.round;
  const losers = roundLosers(state);
  return (
    <div className="summary">
      <div className="card summary-head">
        <Medallion icon={Martini} large />
        <div className="eyebrow gold">
          Round {state.round} of {state.setup.settings.rounds}
        </div>
        <h2>Round complete</h2>
        <p className="muted">
          {plural(left, 'round')} to go. Passes and hints have been refreshed.
        </p>
      </div>
      {losers.length > 0 && (
        <div className="drink drink-take">
          <Wine size={16} />
          <span>
            Lowest score this round: <strong>{losers.map((p) => p.name).join(' & ')}</strong> {losers.length === 1 ? 'takes' : 'take'}{' '}
            {plural(ROUND_LOSER_SIPS, 'sip')}
          </span>
        </div>
      )}
      <ol className="standings">
        {rows.map(({ player, stats, rank }) => (
          <li key={player.id} className={rank === 1 ? 'leader' : ''}>
            <span className="rank">{rank}</span>
            <Avatar player={player} />
            <span className="st-name">{player.name}</span>
            <span className={`st-round ${stats.roundScore ? '' : 'none'}`}>+{stats.roundScore}</span>
            <span className="st-score">{stats.score}</span>
          </li>
        ))}
      </ol>
      <div className="sticky-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={onNext}>
          Begin round {state.round + 1} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function StatLine({ stats, drinking }: { stats: PlayerStats; drinking: boolean }) {
  const acc = accuracy(stats);
  const items: ReactNode[] = [
    <>
      <b>
        {stats.correct}/{stats.correct + stats.wrong}
      </b>{' '}
      right
    </>,
  ];
  if (acc !== null) items.push(<b>{Math.round(acc * 100)}%</b>);
  if (stats.bestStreak >= 2) items.push(<>Best streak <b>{stats.bestStreak}</b></>);
  if (stats.hints) items.push(<><b>{stats.hints}</b> {stats.hints === 1 ? 'hint' : 'hints'}</>);
  if (stats.passes) items.push(<><b>{stats.passes}</b> {stats.passes === 1 ? 'pass' : 'passes'}</>);
  if (drinking && stats.sips) items.push(<><b>{stats.sips}</b> {stats.sips === 1 ? 'sip' : 'sips'}</>);
  return (
    <span className="st-stats">
      {items.map((item, i) => (
        <span key={i}>{item}</span>
      ))}
    </span>
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
  if (solo) headline = `${rows[0].stats.score} out of ${asked}`;
  else if (winners.length === 1) headline = `${winners[0].player.name} wins`;
  else headline = `A draw: ${winners.map((w) => w.player.name).join(' & ')}`;

  return (
    <div className="summary">
      <div className="card summary-head celebrate">
        <Medallion icon={Trophy} large />
        <div className="eyebrow gold">Final results</div>
        <h2>{headline}</h2>
        {!solo && settings.drinking && winners.length < rows.length && (
          <p className="muted">Last place: {rows[rows.length - 1].player.name}. The next round is on them.</p>
        )}
      </div>
      <ol className="standings">
        {rows.map(({ player, stats, rank }) => (
          <li key={player.id} className={rank === 1 ? 'leader' : ''}>
            <span className="rank">{rank === 1 ? <Crown size={18} strokeWidth={1.75} aria-label="Winner" /> : rank}</span>
            <Avatar player={player} />
            <div className="st-body">
              <span className="st-name">{player.name}</span>
              <StatLine stats={stats} drinking={settings.drinking} />
            </div>
            <span className="st-score">{stats.score}</span>
          </li>
        ))}
      </ol>
      <div className="sticky-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={onRematch}>
          <RotateCcw size={18} /> Rematch
        </button>
        <div className="action-row">
          <button type="button" className="btn" onClick={onChangeSetup}>
            Change setup
          </button>
          <button type="button" className="btn btn-ghost" onClick={onHome}>
            <House size={18} /> Home
          </button>
        </div>
      </div>
    </div>
  );
}
