import { useEffect, useReducer, useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { SetupScreen } from './components/SetupScreen';
import { gameReducer, type GameAction, type GameState } from './lib/engine';
import { load, remove, save } from './lib/storage';
import { useTriviaFeeder } from './lib/useTriviaFeeder';
import { gameIdOf, type GameId } from './lib/setup';

type Screen = { name: 'home' } | { name: 'setup'; game: GameId; autoStart?: boolean } | { name: 'game' };

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
        key={screen.game}
        game={screen.game}
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
    const id = gameIdOf(game.setup);
    return (
      <GameScreen
        state={game}
        dispatch={dispatch}
        notice={notice}
        onQuit={home}
        onRematch={() => setScreen({ name: 'setup', game: id, autoStart: true })}
        onChangeSetup={() => setScreen({ name: 'setup', game: id })}
      />
    );
  }

  return (
    <Home
      saved={game}
      onResume={() => setScreen({ name: 'game' })}
      onDiscard={() => dispatch({ type: 'load', game: null })}
      onPick={(id) => setScreen({ name: 'setup', game: id })}
    />
  );
}
