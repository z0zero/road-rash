# Rev & Wreck

A browser motorcycle combat racing game inspired by Road Rash on the SEGA Genesis. You race fourteen riders down a winding coastal road at sunset, punching, kicking and clubbing them off their bikes on the way, while dodging traffic and the cops. Finish third or better to qualify.

**Play it: https://road-rash-five.vercel.app** (desktop browser with WebGL 2, keyboard or gamepad)

## How to play

| | Keyboard | Gamepad |
|---|---|---|
| Throttle | W or ↑ | Right trigger or A |
| Brake | S or ↓ | Left trigger |
| Steer | A/D or ←/→ | Left stick or D-pad |
| Punch, or swing a club | J or Z | X |
| Kick | K or X | B |
| Pause | Esc or P | Start |
| Back, in menus | Esc | B |

- In the menus, ↑/↓ move between buttons, as the D-pad and the left stick do, and Enter or A presses one.
- Choose Easy, Normal or Hard under Start Race, with a click, or, once the row has the focus, with ←/→, the D-pad or the left stick; Enter, Space or A there starts the race. On Easy the opponents ride slower and fight less, and the field stays nearer you; on Hard they ride closer to the limit and fight more. Each difficulty keeps its own personal best.
- You start last. Ride hard, and fight anyone who rides up beside you.
- To take a rider's club, throw a hit at them while they wind up a swing.
- Every hit costs stamina. A rider with no stamina left is knocked off their bike by the next hit.
- Crashes cost your bike condition. If it runs out, you are wrecked.
- After a crash, run back to your bike. A cop who reaches you before you remount busts you.
- `?seed=` and `&difficulty=` in the address replay a race, as in `?seed=1234&difficulty=hard`, and the results and pause screens show the race's difficulty and seed. A seed alone races Normal, as v1.0.0's addresses did.

## Development

Node 22.12 or newer. Install with `npm ci`.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Static export into `out/` |
| `npm run lint` | ESLint, including the Race module's purity rules |
| `npm run typecheck` | Type-checks the app, and the Race module without DOM types |
| `npm test` | Vitest unit tests: the Race module and save data |
| `npm run test:smoke` | Playwright smoke test against `out/` (run `npm run build` first) |

Where to read next:
- `AGENTS.md`: the code map.
- `CODING_STANDARDS.md`: the rules the code follows.
- `GLOSSARY.md`: the game's words.
- `docs/adr/`: the decisions behind it.
- `CHANGELOG.md`: what changed in each release.

## Credits

- Everything was built in code for this project: the bikes, riders, cars and coast, every sound effect, and the game itself.
- The race music is "Hot Roadway [Remake]" by MintoDog, from OpenGameArt.org, released under CC0. Its source and licence check are in `src/audio/music.ts`.
- Rev & Wreck is an original game inspired by Road Rash. It uses none of Electronic Arts' names, graphics or music.

## Licence

MIT. See `LICENSE`.
