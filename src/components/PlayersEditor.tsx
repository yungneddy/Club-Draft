import { MAX_PLAYERS, newPlayer, PLAYER_COLORS } from '../lib/setup';
import type { Player } from '../types';

export function PlayersEditor(props: { players: Player[]; onChange: (players: Player[]) => void; showInterests: boolean }) {
  const { players, onChange, showInterests } = props;

  const update = (id: string, change: Partial<Player>) => onChange(players.map((p) => (p.id === id ? { ...p, ...change } : p)));

  const add = () => {
    const used = new Set(players.map((p) => p.color));
    const player = newPlayer(players.length);
    onChange([...players, { ...player, color: PLAYER_COLORS.find((c) => !used.has(c)) ?? player.color }]);
  };

  return (
    <div className="players">
      {players.map((p, i) => (
        <div className="player-row" key={p.id} style={{ '--player': p.color } as React.CSSProperties}>
          <div className="player-main">
            <span className="player-dot" aria-hidden>
              {i + 1}
            </span>
            <input
              className="input"
              value={p.name}
              maxLength={20}
              aria-label={`Player ${i + 1} name`}
              onChange={(e) => update(p.id, { name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && update(p.id, { name: `Player ${i + 1}` })}
            />
            {players.length > 1 && (
              <button type="button" className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => onChange(players.filter((x) => x.id !== p.id))}>
                ✕
              </button>
            )}
          </div>
          {showInterests && (
            <input
              className="input input-sub"
              value={p.interests}
              maxLength={200}
              placeholder="Interests (optional): F1, cooking…"
              aria-label={`${p.name}'s interests`}
              onChange={(e) => update(p.id, { interests: e.target.value })}
            />
          )}
        </div>
      ))}
      {players.length < MAX_PLAYERS && (
        <button type="button" className="btn btn-ghost" onClick={add}>
          + Add player
        </button>
      )}
    </div>
  );
}
