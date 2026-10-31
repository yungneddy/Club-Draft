import { currentPlayer, type GameState } from '../lib/engine';
import { GAME_INFO, gameTitle } from '../lib/setup';
import type { GameKind } from '../types';

const KINDS: GameKind[] = ['trivia', 'flags', 'geography'];

export function Home(props: { saved: GameState | null; onResume: () => void; onDiscard: () => void; onPick: (kind: GameKind) => void }) {
  const { saved, onResume, onDiscard, onPick } = props;
  return (
    <div className="screen home">
      <header className="hero">
        <div className="logo" aria-hidden>
          🍻
        </div>
        <h1>Club Draft</h1>
        <p className="muted">Trivia and party games for 1–10 players, on one phone.</p>
      </header>

      {saved && saved.phase !== 'finished' && (
        <section className="card resume">
          <div>
            <div className="section-title">Game in progress</div>
            <p className="muted small">
              {GAME_INFO[saved.setup.kind].emoji} {gameTitle(saved.setup)} · Round {saved.round}/{saved.setup.settings.rounds} ·{' '}
              {currentPlayer(saved).name} is up
            </p>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-ghost" onClick={onDiscard}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-grow" onClick={onResume}>
              Resume
            </button>
          </div>
        </section>
      )}

      <nav className="game-list" aria-label="Games">
        {KINDS.map((kind) => {
          const info = GAME_INFO[kind];
          return (
            <button key={kind} type="button" className={`game-tile tile-${kind}`} onClick={() => onPick(kind)}>
              <span className="tile-emoji" aria-hidden>
                {info.emoji}
              </span>
              <span>
                <span className="tile-title">{info.title}</span>
                <span className="tile-tagline">{info.tagline}</span>
              </span>
              <span className="tile-go" aria-hidden>
                →
              </span>
            </button>
          );
        })}
        <div className="game-tile tile-soon" aria-disabled>
          <span className="tile-emoji" aria-hidden>
            🎲
          </span>
          <span>
            <span className="tile-title">More drinking games</span>
            <span className="tile-tagline">Coming soon.</span>
          </span>
        </div>
      </nav>

      <footer className="footer muted small">Drinking mode is optional. Know your limits, and never drink and drive.</footer>
    </div>
  );
}
