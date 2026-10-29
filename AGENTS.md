# Rev & Wreck

A browser motorcycle combat racing game inspired by Road Rash, built as a client-only static Next.js site (ADR 0003). Follow `CODING_STANDARDS.md`. Domain terms are in `GLOSSARY.md` and decisions in `docs/adr/`.

## Commands

Node 22.12 or newer. Install with `npm ci`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000. Pick another port with `PORT=4102 npm run dev`. |
| `npm run build` | Static export into `out/`. |
| `npm run lint` | ESLint, including the Race module's purity rules. |
| `npm run typecheck` | Generates Next's route types, then type-checks the app, and the Race module again without DOM types. |
| `npm test` | Vitest unit tests: the Race module and save data. `npm run test:watch` re-runs them on change. |
| `npm run test:smoke` | Playwright smoke test against `out/`, so run `npm run build` first. It serves `out/` on `PORT` (default 3000). The first time on a new machine, run `npx playwright install chromium`. |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, the build and the smoke test on every push and pull request.

## Code map

- `src/race`: the **Race** module, the game's rules as a pure, deterministic simulation (ADR 0004). `createRace`, `step`, `snapshot`, `drainEvents`, `fastForward` and the track all come from `@/race`.
- `src/save-data`: settings and the personal best in localStorage.
- `src/game`: `GameSession` steps the race from the frame clock and turns its events into screens; `Game.tsx` wires it to React, the keyboard and the renderer.
- `src/input`: keyboard to player input.
- `src/renderer`: the React Three Fiber scene, built from the track's data and the session's snapshots. `Scene.tsx` puts it together: the sunset sky, haze and sea (`sunset.ts`, `Sky.tsx`, `Sea.tsx`), the road and the land either side (`track-geometry.ts`, `terrain.ts`), the instanced scenery (`Scenery.tsx`), every rider's bike and rider built in code in their own livery (`rider-model.ts`, `liveries.ts`, posed from `RiderMotion`), the chase camera, post-processing and speed effects, and the performance monitor's quality levels (`quality.ts`). No models or textures are loaded: everything is built in code.
- `src/ui`: the title screen, settings, HUD, pause menu and results screen.
- `e2e`: the Playwright smoke test.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `z0zero/road-rash`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
