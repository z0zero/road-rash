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

- `src/race`: the **Race** module, the game's rules as a pure, deterministic simulation (ADR 0004). `createRace`, `step`, `snapshot`, `drainEvents`, `fastForward` and the track all come from `@/race`. `race.ts` creates a race from its seed and difficulty and orders each step; the rules share the race's state (`race-state.ts`) and its riders (`riders.ts`), and each sits with its helpers: the start grid in `field.ts`; what each difficulty (Easy, Normal, Hard) changes, the opponents' pace, attacks, breathers, patience and catch-up, in `difficulty.ts`; what the opponents decide each step in `opponents.ts`, from how they ride (`opponent-riding.ts`) and fight (`opponent-fighting.ts`); what the cops decide and how they ride, patrol and take turns in `cops.ts`; attacks, hits, clubs, knock-offs, cops fighting back and stamina in `fighting.ts`; crashes, wrecks, running back and remounting in `crashing.ts`; bumps, run-ins, running into cars and obstacles, and knock-downs in `contact.ts`; sending cops to crashes and busting in `busting.ts`; the cars in `traffic.ts`. `ground-grid.ts` finds the points near a spot on the ground: the track's generator, its placements and the renderer's land share it. `snapshot.ts` turns the state into snapshots, and `results.ts` finishes riders and works out positions and the results.
- `src/save-data`: settings (with the chosen difficulty, and whether the player has ever attacked, which ends the hit-back prompt) and a personal best for each difficulty in localStorage; a v1.0.0 save's personal best becomes Normal's.
- `src/game`: `GameSession` steps the race, at the difficulty chosen or the one the page's address asks for (`race-address.ts` writes and reads `?seed=&difficulty=`, a seed alone asking for Normal), from the frame clock, turns its events into screens and saves the player's first attack, and once the player's race is over races the rest of the field to the finish a few milliseconds a frame while the results fill in; `Game.tsx` wires it to React, the keyboard and gamepads, the renderer and the sound. `GameLoader.tsx` first checks the browser (`browser-support.ts`): a touch-only phone or tablet, or a browser without WebGL 2, gets a screen saying why instead of the game.
- `src/input`: the keyboard and gamepads to player input, read together (`player-controls.ts`, which also says which of the two the player last rode with), with one latch for punch and kick presses (`presses.ts`). The controls, the keys for each and their names on screen are in one table (`bindings.ts`), and each control's gamepad buttons in another (`GAMEPAD` in `gamepad.ts`); the title screen reads the first, and the Controls screen and the hit-back prompt read both. Gamepads with the standard mapping are polled every frame (`gamepad.ts`). They and the arrow keys get round the menus (`menus.ts`): up and down move the focus, and left and right turn a slider or move a choice, such as the difficulty; a gamepad's A presses what has the focus, as Enter does, and its B goes back as Esc does. Losing window focus releases every held input.
- `src/renderer`: the React Three Fiber scene, built from the track's data and the session's snapshots. `Scene.tsx` puts it together: the sunset sky, haze and sea (`sunset.ts`, `Sky.tsx`, `Sea.tsx`), the road and the land either side (`track-geometry.ts`, `terrain.ts`), the instanced scenery and obstacles (`Scenery.tsx`, `Obstacles.tsx`, `obstacle-models.ts`), the traffic's cars, built in code and drawn with instancing in their own paints (`Traffic.tsx`, `car-models.ts`), every rider's bike and body built in code in their own livery, and every cop on a bike with panniers and a flashing light bar, with a club in hand while they hold one (`BikeAndBody.tsx`, `bike-model.ts`, `liveries.ts`, posed from a `BikeMotion` (`bike-motion.ts`), a rider's `RiderMotion` or a cop's `CopMotion`, which also follows them off their bike after a crash, and animated punching, kicking, swinging a club, tumbling and running by `body-animation.ts`), the chase camera (shaken by the player's hits, crashes and knock-downs), post-processing and speed effects, and the performance monitor's quality levels (`quality.ts`). No models or textures are loaded: everything is built in code.
- `src/audio`: the sound, with Web Audio. `startGameAudio` (`game-audio.ts`) follows the session: the Start Race click unlocks it (where the browser keeps it locked after a gamepad's press, the next key press or click does, and until then the HUD says so, unless nothing would be heard at the player's volumes or a key press or click has already failed to start it), the race's events play the hits, crashes and knock-downs (`sounds.ts`), each frame drives the engines (`engine.ts`), skids, gravel and the siren, which sounds from the nearest cop near the player, and the screens set the music (`music.ts`) and the mix (`mixer.ts`). Every sound is synthesized except the race music, `public/audio/hot-roadway.mp3` (CC0; its source, licence check and re-encoding are in `music.ts`). Browsers that block audio leave the game silent, never broken.
- `src/ui`: the title screen (with the difficulty under Start Race, `DifficultyPicker.tsx`), controls, settings (volumes and Reduce motion), credits, HUD (with the cop alert and the hit-back prompt, and a note while the browser keeps the sound locked), pause menu and results screen (with its remark), and the screens for touch-only devices and browsers without WebGL 2. The screens over the game share one `Dialog`, but for the results screen, which is laid out on its own and shares only its way back (`useBackKey`) with it; every screen shares one look (`panel.ts`). Keys are named as the player's keyboard labels them where the browser can say (`key-names.ts`), and the Controls screen and the hit-back prompt show them, and gamepad buttons, as key caps (`KeyCaps.tsx`).
- `src/math.ts`: small numeric helpers (`clamp`, `smoothstep`, `radians`) for the renderer, the sound, the UI and the input. The Race module keeps its own.
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
