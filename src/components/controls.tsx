import { Check, Earth, Flag as FlagIcon, Minus, Plus, Sparkles, Wine, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { flagUrl } from '../lib/flags';
import type { GameId } from '../lib/setup';
import type { Player } from '../types';

export const GAME_ICONS: Record<GameId, LucideIcon> = {
  trivia: Sparkles,
  'drinking-trivia': Wine,
  flags: FlagIcon,
  geography: Earth,
};

export const playerStyle = (p: Player) => ({ '--player': p.color }) as CSSProperties;

export function Avatar({ player, size }: { player: Player; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ''}`} style={playerStyle(player)} aria-hidden>
      {player.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function Medallion({ icon: Icon, large }: { icon: LucideIcon; large?: boolean }) {
  return (
    <span className={`medallion ${large ? 'medallion-lg' : ''}`} aria-hidden>
      <Icon size={large ? 30 : 22} strokeWidth={1.5} />
    </span>
  );
}

/** The Troops Trivia mark: a coupe glass inside a double ring. */
export function Crest({ size = 64 }: { size?: number }) {
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="32" cy="32" r="30" />
      <circle cx="32" cy="32" r="26.5" strokeWidth="0.75" opacity="0.55" />
      <path d="M20 22h24c-.6 7-5.6 11-12 11s-11.4-4-12-11z" />
      <path d="M32 33v11M25.5 45h13" />
      <circle cx="29" cy="27" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="34.5" cy="25.6" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="37.2" cy="28.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const { label, value, min, max, onChange, hint } = props;
  return (
    <div className="stepper">
      <div>
        <div className="stepper-label">{label}</div>
        {hint && <div className="hint-text">{hint}</div>}
      </div>
      <div className="stepper-controls">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} />
        </button>
        <span className="stepper-value" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label?: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <div className="field">
      {label && <div className="field-label">{label}</div>}
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'active' : ''}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Chips<T extends string>(props: {
  label?: string;
  selected: T[];
  options: { value: T; label: string }[];
  onChange: (selected: T[]) => void;
}) {
  const { label, selected, options, onChange } = props;
  return (
    <div className="field">
      {label && <div className="field-label">{label}</div>}
      <div className="chips">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              className={`chip ${on ? 'active' : ''}`}
              // Keep at least one selected.
              onClick={() => (on ? selected.length > 1 && onChange(selected.filter((v) => v !== o.value)) : onChange([...selected, o.value]))}
            >
              {on && <Check size={14} strokeWidth={2.5} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle(props: {
  label: string;
  icon?: LucideIcon;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { label, icon: Icon, description, checked, onChange } = props;
  return (
    <label className="toggle">
      <span>
        <span className="toggle-label">
          {Icon && <Icon size={18} strokeWidth={1.75} />}
          {label}
        </span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
    </label>
  );
}

export function Flag({ code, alt = 'Mystery flag', className = '' }: { code: string; alt?: string; className?: string }) {
  return <img className={`flag ${className}`} src={flagUrl(code)} alt={alt} draggable={false} />;
}
