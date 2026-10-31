import { useEffect, useRef, useState } from 'react';
import { GEO_TYPES } from '../lib/countryQuiz';
import type { GameState } from '../lib/engine';
import {
  DEFAULT_FLAGS,
  DEFAULT_GEO,
  DEFAULT_SETTINGS,
  DEFAULT_TRIVIA,
  defaultPlayers,
  GAME_INFO,
  startCountryGame,
  startTriviaGame,
} from '../lib/setup';
import { load, save } from '../lib/storage';
import { fetchAiStatus, TriviaApiError, type AiStatus } from '../lib/trivia';
import type {
  CountryDifficulty,
  FlagOptions,
  FlagStyle,
  GameKind,
  GameSettings,
  GameSetup,
  GeoOptions,
  Player,
  Region,
  TriviaDifficulty,
  TriviaOptions,
} from '../types';
import { Chips, Segmented, Stepper, Toggle } from './controls';
import { PlayersEditor } from './PlayersEditor';

const TOPIC_IDEAS = ['90s music', 'Premier League', 'The Office', 'Marvel movies', 'Space', 'Cocktails', 'Harry Potter', 'Ancient Rome'];

const REGIONS: { value: Region; label: string }[] = [
  { value: 'world', label: 'World' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Asia', label: 'Asia' },
  { value: 'Africa', label: 'Africa' },
  { value: 'Americas', label: 'Americas' },
  { value: 'Oceania', label: 'Oceania' },
];

const COUNTRY_DIFFICULTY: { value: CountryDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'all', label: 'All' },
];

const LOADING_LINES = [
  'Fact-checking with a straight face…',
  'Hiding the answers from your mates…',
  'Pouring a fresh round of questions…',
  'Making the hints just helpful enough…',
];

type AiCheck = { state: 'checking' } | { state: 'done'; status: AiStatus | null };

export function SetupScreen(props: { kind: GameKind; autoStart?: boolean; onBack: () => void; onStart: (game: GameState) => void }) {
  const { kind, autoStart, onBack, onStart } = props;
  const info = GAME_INFO[kind];

  const [players, setPlayers] = useState<Player[]>(() => load('players', defaultPlayers()));
  const [settings, setSettings] = useState<GameSettings>(() => ({ ...DEFAULT_SETTINGS[kind], ...load(`settings:${kind}`, {}) }));
  const [trivia, setTrivia] = useState<TriviaOptions>(() => ({ ...DEFAULT_TRIVIA, ...load('options:trivia', {}) }));
  const [flags, setFlags] = useState<FlagOptions>(() => ({ ...DEFAULT_FLAGS, ...load('options:flags', {}) }));
  const [geo, setGeo] = useState<GeoOptions>(() => ({ ...DEFAULT_GEO, ...load('options:geography', {}) }));
  const [accessCode, setAccessCode] = useState(() => load('accessCode', ''));

  const [ai, setAi] = useState<AiCheck>({ state: 'checking' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<TriviaApiError | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    save('players', players);
  }, [players]);
  useEffect(() => {
    save(`settings:${kind}`, settings);
  }, [kind, settings]);
  useEffect(() => {
    save('options:trivia', trivia);
  }, [trivia]);
  useEffect(() => {
    save('options:flags', flags);
  }, [flags]);
  useEffect(() => {
    save('options:geography', geo);
  }, [geo]);
  useEffect(() => {
    save('accessCode', accessCode);
  }, [accessCode]);

  useEffect(() => {
    if (kind !== 'trivia') return;
    let live = true;
    fetchAiStatus().then((status) => live && setAi({ state: 'done', status }));
    return () => {
      live = false;
    };
  }, [kind]);

  useEffect(() => () => abort.current?.abort(), []);

  const aiReady = ai.state === 'done' && Boolean(ai.status?.configured);
  const set = (change: Partial<GameSettings>) => setSettings((s) => ({ ...s, ...change }));

  function buildSetup(): GameSetup {
    const cleanPlayers = players.map((p, i) => ({ ...p, name: p.name.trim() || `Player ${i + 1}` }));
    if (kind === 'trivia') return { kind, players: cleanPlayers, settings, options: trivia };
    if (kind === 'flags') return { kind, players: cleanPlayers, settings, options: flags };
    return { kind, players: cleanPlayers, settings, options: geo };
  }

  async function start(useAi = aiReady) {
    const setup = buildSetup();
    if (setup.kind !== 'trivia') {
      onStart(startCountryGame(setup));
      return;
    }
    setError(null);
    setLoading(true);
    abort.current = new AbortController();
    try {
      onStart(await startTriviaGame(setup, { enabled: useAi, accessCode }, abort.current.signal));
    } catch (e) {
      if (abort.current.signal.aborted) return;
      setError(e instanceof TriviaApiError ? e : new TriviaApiError('failed', 'Something went wrong.'));
    } finally {
      setLoading(false);
    }
  }

  // "Rematch" from the results screen lands here and starts straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || (kind === 'trivia' && ai.state === 'checking')) return;
    autoStarted.current = true;
    void start();
  });

  const total = players.length * settings.rounds * settings.questionsPerRound;

  return (
    <div className="screen setup">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to games">
          ←
        </button>
        <h1>
          <span aria-hidden>{info.emoji}</span> {info.title}
        </h1>
        <span className="topbar-spacer" />
      </header>

      {kind === 'trivia' && (
        <section className="card">
          <label className="field-label" htmlFor="topic">
            What do you want trivia about?
          </label>
          <input
            id="topic"
            className="input input-lg"
            value={trivia.topic}
            maxLength={200}
            placeholder="e.g. 90s movies, Premier League, The Office"
            onChange={(e) => setTrivia({ ...trivia, topic: e.target.value })}
          />
          <div className="chips">
            {TOPIC_IDEAS.map((t) => (
              <button key={t} type="button" className={`chip ${trivia.topic === t ? 'active' : ''}`} onClick={() => setTrivia({ ...trivia, topic: t })}>
                {t}
              </button>
            ))}
          </div>
          <p className="muted small">Leave it blank for general knowledge. Each player can add their own interests below.</p>
          <Segmented<TriviaDifficulty>
            label="Difficulty"
            value={trivia.difficulty}
            onChange={(difficulty) => setTrivia({ ...trivia, difficulty })}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
              { value: 'mixed', label: 'Mixed' },
            ]}
          />
          <AiStatusLine check={ai} />
          {ai.state === 'done' && ai.status?.accessCodeRequired && (
            <div className="field">
              <label className="field-label" htmlFor="access-code">
                Access code
              </label>
              <input
                id="access-code"
                className="input"
                value={accessCode}
                autoComplete="off"
                placeholder="Ask whoever set up this app"
                onChange={(e) => setAccessCode(e.target.value)}
              />
            </div>
          )}
        </section>
      )}

      {kind === 'flags' && (
        <section className="card">
          <Segmented<Region> label="Region" value={flags.region} options={REGIONS} onChange={(region) => setFlags({ ...flags, region })} />
          <Segmented<CountryDifficulty>
            label="Difficulty"
            value={flags.difficulty}
            options={COUNTRY_DIFFICULTY}
            onChange={(difficulty) => setFlags({ ...flags, difficulty })}
          />
          <Segmented<FlagStyle>
            label="Question style"
            value={settings.answerMode === 'reveal' ? 'name' : flags.style}
            onChange={(style) => setFlags({ ...flags, style })}
            options={[
              { value: 'name', label: 'Name it' },
              { value: 'find', label: 'Find it', disabled: settings.answerMode === 'reveal' },
              { value: 'mix', label: 'Mix', disabled: settings.answerMode === 'reveal' },
            ]}
          />
          {settings.answerMode === 'reveal' && <p className="muted small">"Find it" needs multiple choice, so say-it-out-loud games only use "Name it".</p>}
        </section>
      )}

      {kind === 'geography' && (
        <section className="card">
          <Segmented<Region> label="Region" value={geo.region} options={REGIONS} onChange={(region) => setGeo({ ...geo, region })} />
          <Segmented<CountryDifficulty>
            label="Difficulty"
            value={geo.difficulty}
            options={COUNTRY_DIFFICULTY}
            onChange={(difficulty) => setGeo({ ...geo, difficulty })}
          />
          <Chips
            label="Question types"
            selected={geo.types}
            options={GEO_TYPES.map((t) => ({ value: t.type, label: t.label }))}
            onChange={(types) => setGeo({ ...geo, types })}
          />
        </section>
      )}

      <section className="card">
        <div className="section-title">
          Players <span className="muted">({players.length}/10)</span>
        </div>
        <PlayersEditor players={players} onChange={setPlayers} showInterests={kind === 'trivia'} />
      </section>

      <section className="card">
        <div className="section-title">Rules</div>
        <Segmented
          label="How do you answer?"
          value={settings.answerMode}
          onChange={(answerMode) => set({ answerMode })}
          options={[
            { value: 'reveal', label: '🗣️ Say it out loud' },
            { value: 'choice', label: '🔘 Multiple choice' },
          ]}
        />
        <p className="muted small">
          {settings.answerMode === 'reveal'
            ? 'Answer out loud, reveal the answer, then tap Correct or Wrong.'
            : 'Pick from four options. The game marks it for you.'}
        </p>
        <Stepper label="Rounds" value={settings.rounds} min={1} max={10} onChange={(rounds) => set({ rounds })} />
        <Stepper
          label="Questions per round"
          hint="For each player"
          value={settings.questionsPerRound}
          min={1}
          max={10}
          onChange={(questionsPerRound) => set({ questionsPerRound })}
        />
        <Stepper
          label="Passes per round"
          hint="Skip a question"
          value={settings.passesPerRound}
          min={0}
          max={5}
          onChange={(passesPerRound) => set({ passesPerRound })}
        />
        <Stepper label="Hints per round" value={settings.hintsPerRound} min={0} max={5} onChange={(hintsPerRound) => set({ hintsPerRound })} />
        <Toggle
          label="🍺 Drinking mode"
          checked={settings.drinking}
          onChange={(drinking) => set({ drinking })}
          description="Wrong answer or pass = 1 sip. Three right in a row = hand out 2 sips."
        />
      </section>

      <div className="sticky-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => void start()} disabled={kind === 'trivia' && ai.state === 'checking'}>
          Start · {total} question{total === 1 ? '' : 's'}
        </button>
      </div>

      {(loading || error) && (
        <LoadingOverlay
          topic={trivia.topic.trim() || 'general knowledge'}
          error={error}
          onCancel={() => {
            abort.current?.abort();
            setLoading(false);
            setError(null);
          }}
          onRetry={() => void start(true)}
          onOffline={() => void start(false)}
        />
      )}
    </div>
  );
}

function AiStatusLine({ check }: { check: AiCheck }) {
  if (check.state === 'checking') return <p className="status-line muted">Checking the question writer…</p>;
  if (check.status?.configured) return <p className="status-line good">✨ Claude will write fresh questions for every game.</p>;
  return (
    <p className="status-line warn">
      📦 No Claude API key on this server, so you'll get built-in questions matched to your topic. See the README to switch on custom topics.
    </p>
  );
}

function LoadingOverlay(props: { topic: string; error: TriviaApiError | null; onCancel: () => void; onRetry: () => void; onOffline: () => void }) {
  const { topic, error, onCancel, onRetry, onOffline } = props;
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div className="overlay-card">
        {error ? (
          <>
            <div className="big-emoji" aria-hidden>
              😬
            </div>
            <h2>Couldn't write the questions</h2>
            <p className="muted">{error.message}</p>
            <div className="stack">
              {error.code !== 'not_configured' && (
                <button type="button" className="btn btn-primary" onClick={onRetry}>
                  Try again
                </button>
              )}
              <button type="button" className="btn" onClick={onOffline}>
                Play with built-in questions
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                Back to setup
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="spinner" aria-hidden />
            <h2>Writing questions about {topic}</h2>
            <p className="muted">{LOADING_LINES[line]}</p>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
