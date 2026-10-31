import type { ReactNode } from 'react';
import { flagUrl } from '../lib/flags';

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
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <div className="stepper-controls">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span className="stepper-value" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
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
              {on ? '✓ ' : ''}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Toggle(props: { label: string; description?: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  const { label, description, checked, onChange } = props;
  return (
    <label className="toggle">
      <span>
        <span className="toggle-label">{label}</span>
        {description && <span className="muted small block">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
    </label>
  );
}

export function Flag({ code, alt = 'Mystery flag', className = '' }: { code: string; alt?: string; className?: string }) {
  return <img className={`flag ${className}`} src={flagUrl(code)} alt={alt} draggable={false} />;
}
