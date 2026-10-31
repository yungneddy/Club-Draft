# Club Draft 🍻

Party trivia and in-person drinking games for 1–10 players, played on one phone.

## Games

| Game | What it is |
| --- | --- |
| 🧠 **Trivia** | Type any topic ("90s movies", "Premier League", "The Office") and Claude writes the questions. Each player can also add their own interests, and their questions lean that way. |
| 🚩 **Flags** | Name the flag, or find the right flag in a line-up of four. Filter by region and difficulty. |
| 🌍 **Geography** | Capitals, capital → country, neighbours, bigger-or-smaller, continents and landlocked countries. |

Every game shares the same rules:

- **Rounds:** each player answers a set number of questions per round. With several players, turns alternate question by question.
- **Pass and hint limits:** each player gets a fixed number of passes and hints per round. They top up at the start of every round. A pass swaps in a new question without using up your turn. You can't pass after revealing the answer.
- **Answer style:**
  - *Say it out loud:* answer aloud, reveal the answer, then tap **Correct** or **Wrong**.
  - *Multiple choice:* pick from four options and the game marks it for you.
- **Undo:** if someone taps the wrong button, undo the last answer.
- **Drinking mode (optional):** a wrong answer or a pass costs 1 sip, and every 3 correct in a row lets you hand out 2 sips.
- Games are saved on the device, so a refresh or a locked phone doesn't lose the scores.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then paste your Anthropic API key into it
npm run dev
```

Open the URL Vite prints. It also prints a network URL that you can open on your phone if it's on the same Wi-Fi.

**Without an API key**, Trivia still works: it uses about 110 built-in questions matched to your topic (movies, music, sport, science, history, food & drink, animals, tech and general knowledge), plus geography questions. Flags and Geography never need a key.

## Deploy (Vercel)

1. Import this repo at [vercel.com/new](https://vercel.com/new). It detects Vite automatically.
2. Under **Environment Variables**, add:
   - `ANTHROPIC_API_KEY`: your key from [console.anthropic.com](https://console.anthropic.com).
   - `TRIVIA_ACCESS_CODE` (recommended): any code. Players enter it once in the Trivia setup, so strangers who find the URL can't spend your API credits.
3. Deploy, open the site on your phone, and use **Add to Home Screen** to get a full-screen app icon.

The API key stays on the server (`api/trivia.ts`). The browser never sees it.

## How trivia generation works

- `server/trivia.ts` asks Claude (`claude-opus-5-5`, low effort for speed) for questions in a structured JSON format: question, short answer, hint, three wrong options for multiple choice, and a fun fact.
- The game asks for 8 questions per topic to start, then fetches more in the background while you play. Each request lists the questions already used, so you don't get repeats.
- Players with the same topic and interests share a question queue, so nobody gets a question someone else already had.
- If Claude declines a topic, the request is automatically retried on Anthropic's recommended fallback model. If the server can't be reached twice in a row, the game switches to built-in questions and says so.

## Project layout

```
api/trivia.ts            Vercel function: GET = status, POST = write questions
server/trivia.ts         Claude call, prompt and request validation (also served by `npm run dev`)
src/lib/engine.ts        Game rules: turns, rounds, passes, hints, scoring, drinks, undo
src/lib/countryQuiz.ts   Flag and geography question generators
src/lib/trivia.ts        Built-in question bank matching and the API client
src/lib/useTriviaFeeder.ts  Background top-ups of trivia questions
src/components/          Screens: home, setup, game, round summary, results
src/data/countries.ts    Generated from `world-countries` (run `npm run countries` to refresh)
src/data/triviaBank.ts   Built-in trivia questions
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the trivia API |
| `npm test` | Unit tests (game engine, question generators, API handler) |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run countries` | Regenerate `src/data/countries.ts` |

Flags are from [flag-icons](https://github.com/lipis/flag-icons). Country data is from [world-countries](https://github.com/mledoze/countries).

Please drink responsibly. Drinking mode is off by default.
