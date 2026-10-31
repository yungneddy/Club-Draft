import { ChevronRight, Dices } from 'lucide-react';
import { currentPlayer, type GameState } from '../lib/engine';
import { GAME_INFO, gameTitle } from '../lib/setup';
import type { GameKind } from '../types';
import { Crest, GAME_ICONS, Medallion } from './controls';

const KINDS: GameKind[] = ['trivia', 'flags', 'geography'];

export function Home(props: { saved: GameState | null; onResume: () => void; onDiscard: () => void; onPick: (kind: GameKind) => void }) {
  const { saved, onResume, onDiscard, onPick } = props;
  return (
    <div className="screen home">
      <header className="hero">
        <Crest size={68} />
        <div className="eyebrow gold">Est. 2026</div>
        <h1 className="wordmark">Club Draft</h1>
        <p className="hero-lede">Party games for the table. One phone, up to ten players.</p>
      </header>

      {saved && saved.phase !== 'finished' && (
        <section className="card resume" aria-labelledby="resume-title">
          <div>
            <div className="eyebrow gold">Game in progress</div>
            <h2 id="resume-title">{gameTitle(saved.setup)}</h2>
            <p className="muted small">
              Round {saved.round} of {saved.setup.settings.rounds} · {currentPlayer(saved).name} is up
            </p>
          </div>
          <div className="action-row">
            <button type="button" className="btn btn-ghost" onClick={onDiscard}>
              End game
            </button>
            <button type="button" className="btn btn-primary btn-grow" onClick={onResume}>
              Resume
            </button>
          </div>
        </section>
      )}

      <div className="rule eyebrow">The games</div>

      <nav className="game-list" aria-label="Games">
        {KINDS.map((kind) => {
          const info = GAME_INFO[kind];
          return (
            <button key={kind} type="button" className={`game-tile tile-${kind}`} onClick={() => onPick(kind)}>
              <Medallion icon={GAME_ICONS[kind]} />
              <span>
                <span className="tile-title">{info.title}</span>
                <span className="tile-tagline">{info.tagline}</span>
              </span>
              <ChevronRight className="tile-go" size={20} aria-hidden />
            </button>
          );
        })}
        <div className="game-tile tile-soon" aria-disabled>
          <Medallion icon={Dices} />
          <span>
            <span className="tile-title">More games</span>
            <span className="tile-tagline">Drinking games are in the works.</span>
          </span>
        </div>
      </nav>

      <footer className="footer">Drinking rules are optional. Please drink responsibly, and never drink and drive.</footer>
    </div>
  );
}
