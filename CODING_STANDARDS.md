# Coding standards

The rules code review enforces. Rules marked **(lint)** or **(typecheck)** are also checked by `npm run lint` and `npm run typecheck`; review enforces the rest.

## The Race module is pure and deterministic

See ADR 0004.

- `src/race` imports nothing from React, Three.js, Next.js or browser APIs, and nothing from the rest of the game. **(lint, typecheck)**
- No `Math.random`, `Date`, `Date.now` or `performance.now` inside it. Randomness comes from the race's seeded generator (`createRandom`). **(lint)**
- The race moves only in fixed steps of `STEP_SECONDS` (1/60 s). Nothing in it depends on wall-clock time, frame rate or any order that isn't fixed by the code.
- The same seed and the same inputs give identical snapshots, events and results.
- The rest of the game reaches the Race module only through `@/race`. **(lint)**
- Snapshots, events and results are plain data. Never change one after handing it out.
- Game rules live in the Race module. The renderer, UI, input and audio hold no rules: they draw, show, read and play what the race says.

## Units and coordinates

- The simulation uses metres, seconds, metres per second and radians. km/h exists only on screen, converted in one place (`toKmh`).
- When a value's unit isn't obvious from its name, put the unit in the name (`speedKmh`, `timeoutSeconds`).
- *Distance* is metres along the track's centreline. *Offset* is metres sideways from it, positive to the right of the race direction. World coordinates are x east, y up (metres above sea level), z south.

## Vocabulary

- Use the terms in `GLOSSARY.md` in code, tests and UI text: rider, not racer; stamina, not health; crash, not wipeout. If a concept is missing from the glossary, add it there before naming it in code.

## React and rendering

- No React state updates in the frame loop. Per-frame changes, such as HUD numbers and object transforms, go through refs. React state changes only on discrete events, such as a screen change, even when the frame loop is where the game sees the event: a gamepad's Start or A pressed, or the race ending. Nothing sets state just because a frame went by. The one exception is the performance monitor's quality level (`Scene.tsx`): drei's monitor calls back from the frame loop, but only on the rare frames the quality steps up or down. Don't copy it for anything that changes more often.
- Build three.js objects once (in `useMemo`), and change them per frame through refs or in plain functions that `useFrame` calls; the React Compiler's lint rules reject mutating a memoized value inside the component itself. **(lint)**
- Don't allocate in the frame loop when reusing an object is easy.
- Motion that can make players dizzy (camera shake, motion blur, speed lines) checks the Reduce motion setting.
- Touch browser APIs (`window`, `document`, `localStorage`, `navigator`) only in client code, inside effects or event handlers. The site is prerendered as a static export. Two places may also read them while rendering, because the prerender never runs them: a `useSyncExternalStore` snapshot that has a server snapshot for the prerender, and a component loaded only in the browser with `dynamic(…, { ssr: false })`, such as `Game` and everything it renders.
- Every effect that adds a listener, loop or timer removes it in its cleanup. Strict Mode runs effects twice in development.

## TypeScript

- Strict mode. **(typecheck)** No `any`. Cast with `as` only at a data boundary, such as parsing saved data, and validate the value straight after.

## Tests

- Test only at the agreed seams:
  - **The Race module.** Create a race with a seed, feed it scripted input step by step, and assert on snapshots, events and results. To try one rule at a time, a test may set the race up on a closed road (with cars where it puts them, standing still or driving on at a steady speed, if it needs any), without cops or on a worn bike, through the test helpers' `setUpRace`; `@/race` doesn't offer that, since the game never does it.
  - **Save data.**
  - **The browser smoke test** against the static export.
- Rendering, input mapping and audio have no unit tests; the smoke test and play-testing cover them.
- Don't mock the module's own collaborators. Fake only system boundaries, such as storage.
- Take expected values from the spec's rules or from independent literals, never by recomputing them the way the code does.
- Work test-first, one slice at a time: one failing test, then just enough code to pass it.
