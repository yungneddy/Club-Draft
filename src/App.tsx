import { useEffect, useReducer, useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { SetupScreen } from './components/SetupScreen';
import { gameReducer, type GameAction, type GameState } from './lib/engine';
import { load, remove, save } from './lib/storage';
import { useTriviaFeeder } from './lib/useTriviaFeeder';
import type { GameKind } from './types';

type Screen = { name: 'home' } | { name: 'setup'; kind: GameKind; autoStart?: boolean } | { name: 'game' };

type AppAction = GameAction | { type: 'load'; game: GameState | null };

function appReducer(game: GameState | null, action: AppAction): GameState | null {
  if (action.type === 'load') return action.game;
  return game && gameReducer(game, action);
}

/** A game saved by an older version of the app may not have the shape we expect. */
function loadSavedGame(): GameState | null {
  const game = load<GameState | null>('game', null);
  return game?.id && game.setup?.players && game.stats && game.poolInfo ? game : null;
}

export default function App() {
  const [game, dispatch] = useReducer(appReducer, null, loadSavedGame);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const playing = screen.name === 'game' && game !== null;
  const notice = useTriviaFeeder(playing ? game : null, dispatch, load('accessCode', ''));

  // Keep the game across refreshes and locked phones.
  useEffect(() => {
    if (game && game.phase !== 'finished') save('game', game);
    else remove('game');
  }, [game]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name, game?.phase, game?.round]);

  const home = () => {
    dispatch({ type: 'load', game: null });
    setScreen({ name: 'home' });
  };

  if (screen.name === 'setup') {
    return (
      <SetupScreen
        key={screen.kind}
        kind={screen.kind}
        autoStart={screen.autoStart}
        onBack={() => setScreen({ name: 'home' })}
        onStart={(next) => {
          dispatch({ type: 'load', game: next });
          setScreen({ name: 'game' });
        }}
      />
    );
  }

  if (playing) {
    const kind = game.setup.kind;
    return (
      <GameScreen
        state={game}
        dispatch={dispatch}
        notice={notice}
        onQuit={home}
        onRematch={() => setScreen({ name: 'setup', kind, autoStart: true })}
        onChangeSetup={() => setScreen({ name: 'setup', kind })}
      />
    );
  }

  return (
    <Home
      saved={game}
      onResume={() => setScreen({ name: 'game' })}
      onDiscard={() => dispatch({ type: 'load', game: null })}
      onPick={(kind) => setScreen({ name: 'setup', kind })}
    />
  );
}
