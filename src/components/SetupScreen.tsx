import { ChevronLeft, CircleAlert, Crown, Flame, KeyRound, ListChecks, Mic, SkipForward, Sparkles, TrendingDown, Wine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GEO_TYPES } from '../lib/countryQuiz';
import type { GameState } from '../lib/engine';
import {
  DEFAULT_FLAGS,
  DEFAULT_GEO,
  DEFAULT_SETTINGS,
  DEFAULT_TRIVIA,
  defaultPlayers,
  GAMES,
  startCountryGame,
  startTriviaGame,
  type GameId,
} from '../lib/setup';
import { load, save } from '../lib/storage';
import { fetchAiStatus, TriviaApiError, type AiStatus } from '../lib/trivia';
import type {
  CountryDifficulty,
  FlagOptions,
  FlagStyle,
  GameSettings,
  GameSetup,
  GeoOptions,
  Player,
  Region,
  TriviaDifficulty,
  TriviaOptions,
} from '../types';
import { Chips, Crest, Segmented, Stepper, Toggle } from './controls';
import { PlayersEditor } from './PlayersEditor';

const TOPIC_IDEAS = ['90s music', 'Premier League', 'The Office', 'Marvel films', 'Space', 'Cocktails', 'Harry Potter', 'Ancient Rome'];

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

const LOADING_LINES = ['Checking the facts…', 'Sharpening the hints…', 'Hiding the answers…', 'Setting the table…'];

type AiCheck = { state: 'checking' } | { state: 'done'; status: AiStatus | null };

export function SetupScreen(props: { game: GameId; autoStart?: boolean; onBack: () => void; onStart: (game: GameState) => void }) {
  const { game, autoStart, onBack, onStart } = props;
  const entry = GAMES[game];
  const kind = entry.kind;

  const [players, setPlayers] = useState<Player[]>(() => load('players', defaultPlayers()));
  const [settings, setSettings] = useState<GameSettings>(() => ({
    ...DEFAULT_SETTINGS[game],
    ...load(`settings:${game}`, {}),
    // Trivia and Drinking Trivia fix the drinking rules; other games leave it to the players.
    ...(entry.drinking === undefined ? {} : { drinking: entry.drinking }),
  }));
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
    save(`settings:${game}`, settings);
  }, [game, settings]);
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
      setError(e instanceof TriviaApiError ? e : new TriviaApiError('failed', 'Something went wrong. Try again.'));
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
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">
          <h1>{entry.title}</h1>
        </div>
        <span />
      </header>

      {kind === 'trivia' && (
        <section className="card" aria-label="Topic">
          <div className="eyebrow gold">The topic</div>
          <label className="field-label sr-only" htmlFor="topic">
            Topic
          </label>
          <input
            id="topic"
            className="input input-lg"
            value={trivia.topic}
            maxLength={200}
            placeholder="90s films, Formula 1, The Office…"
            onChange={(e) => setTrivia({ ...trivia, topic: e.target.value })}
          />
          <div className="chips">
            {TOPIC_IDEAS.map((t) => (
              <button key={t} type="button" className={`chip ${trivia.topic === t ? 'active' : ''}`} onClick={() => setTrivia({ ...trivia, topic: t })}>
                {t}
              </button>
            ))}
          </div>
          <p className="hint-text">Leave blank for general knowledge. Players can add their own interests below.</p>
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
                placeholder="Ask your host for the code"
                onChange={(e) => setAccessCode(e.target.value)}
              />
            </div>
          )}
        </section>
      )}

      {kind === 'flags' && (
        <section className="card" aria-label="Flags">
          <div className="eyebrow gold">The flags</div>
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
          {settings.answerMode === 'reveal' && <p className="hint-text">“Find it” is available in multiple-choice games.</p>}
        </section>
      )}

      {kind === 'geography' && (
        <section className="card" aria-label="Geography">
          <div className="eyebrow gold">The map</div>
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

      <section className="card" aria-label="Players">
        <div className="card-head">
          <div className="eyebrow gold">Players</div>
          <span className="hint-text">{players.length} of 10</span>
        </div>
        <PlayersEditor players={players} onChange={setPlayers} showInterests={kind === 'trivia'} />
      </section>

      <section className="card" aria-label="House rules">
        <div className="eyebrow gold">House rules</div>
        <Segmented
          label="Answer style"
          value={settings.answerMode}
          onChange={(answerMode) => set({ answerMode })}
          options={[
            {
              value: 'reveal',
              label: (
                <>
                  <Mic size={16} /> Out loud
                </>
              ),
            },
            {
              value: 'choice',
              label: (
                <>
                  <ListChecks size={16} /> Multiple choice
                </>
              ),
            },
          ]}
        />
        <p className="hint-text">
          {settings.answerMode === 'reveal'
            ? 'Answer aloud, reveal the answer, then mark it right or wrong.'
            : 'Choose from four options. Scored automatically.'}
        </p>
        <Stepper label="Rounds" value={settings.rounds} min={1} max={10} onChange={(rounds) => set({ rounds })} />
        <Stepper
          label="Questions per round"
          hint="Per player"
          value={settings.questionsPerRound}
          min={1}
          max={10}
          onChange={(questionsPerRound) => set({ questionsPerRound })}
        />
        <Stepper
          label="Passes per round"
          hint="Swap a question you can't answer"
          value={settings.passesPerRound}
          min={0}
          max={5}
          onChange={(passesPerRound) => set({ passesPerRound })}
        />
        <Stepper label="Hints per round" value={settings.hintsPerRound} min={0} max={5} onChange={(hintsPerRound) => set({ hintsPerRound })} />
        {entry.drinking === undefined && (
          <Toggle
            label="Drinking rules"
            icon={Wine}
            checked={settings.drinking}
            onChange={(drinking) => set({ drinking })}
            description="Turn this into a drinking game."
          />
        )}
        {entry.drinking === undefined && settings.drinking && (
          <DrinkingRules settings={settings} multiplayer={players.length > 1} onChange={set} />
        )}
      </section>

      {entry.drinking && (
        <section className="card" aria-label="Drinking rules">
          <div className="eyebrow gold">Drinking rules</div>
          <DrinkingRules settings={settings} multiplayer={players.length > 1} onChange={set} />
          <p className="hint-text">For adults of legal drinking age. Water counts as a sip.</p>
        </section>
      )}

      <div className="sticky-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => void start()} disabled={kind === 'trivia' && ai.state === 'checking'}>
          Start game · {total} question{total === 1 ? '' : 's'}
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

function DrinkingRules(props: { settings: GameSettings; multiplayer: boolean; onChange: (change: Partial<GameSettings>) => void }) {
  const { settings, multiplayer, onChange } = props;
  return (
    <>
      <Stepper
        label="Sips per wrong answer"
        value={settings.wrongSips}
        min={1}
        max={3}
        onChange={(wrongSips) => onChange({ wrongSips })}
      />
      <ul className="rules-list">
        <li>
          <SkipForward size={16} /> Pass: 1 sip
        </li>
        <li>
          <Flame size={16} /> Three in a row: hand out 2 sips
        </li>
        {multiplayer && (
          <>
            <li>
              <TrendingDown size={16} /> Lowest score each round: 2 sips
            </li>
            <li>
              <Crown size={16} /> Last place buys the next round
            </li>
          </>
        )}
      </ul>
    </>
  );
}

function AiStatusLine({ check }: { check: AiCheck }) {
  if (check.state === 'checking') return <p className="status-line">Connecting…</p>;
  if (check.status?.configured) {
    return (
      <p className="status-line good">
        <Sparkles size={16} />
        <span>
          <strong>Any topic, fresh questions.</strong> A new set is written for every game.
        </span>
      </p>
    );
  }
  return (
    <p className="status-line">
      <KeyRound size={16} />
      <span>
        <strong>Playing with the house questions.</strong> Add an Anthropic API key to this server to unlock any topic. See the README.
      </span>
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
            <CircleAlert size={36} strokeWidth={1.5} className="muted" aria-hidden />
            <h2>We couldn't write your questions</h2>
            <p className="muted">{error.message}</p>
            <div className="stack">
              {error.code !== 'not_configured' && (
                <button type="button" className="btn btn-primary" onClick={onRetry}>
                  Try again
                </button>
              )}
              <button type="button" className="btn" onClick={onOffline}>
                Play the house questions
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                Back to setup
              </button>
            </div>
          </>
        ) : (
          <>
            <Crest size={56} />
            <div className="eyebrow gold">Writing your questions</div>
            <h2>{topic.charAt(0).toUpperCase() + topic.slice(1)}</h2>
            <p className="muted">{LOADING_LINES[line]}</p>
            <div className="spinner" aria-hidden />
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
