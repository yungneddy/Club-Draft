import { Plus, X } from 'lucide-react';
import { MAX_PLAYERS, newPlayer, PLAYER_COLORS } from '../lib/setup';
import type { Player } from '../types';
import { Avatar } from './controls';

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
        <div className="player-row" key={p.id}>
          <div className="player-main">
            <Avatar player={p} />
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
                <X size={18} />
              </button>
            )}
          </div>
          {showInterests && (
            <input
              className="input input-sub"
              value={p.interests}
              maxLength={200}
              placeholder="Their interests (optional)"
              aria-label={`${p.name}'s interests`}
              onChange={(e) => update(p.id, { interests: e.target.value })}
            />
          )}
        </div>
      ))}
      {players.length < MAX_PLAYERS && (
        <button type="button" className="btn btn-ghost" onClick={add}>
          <Plus size={18} /> Add player
        </button>
      )}
    </div>
  );
}
