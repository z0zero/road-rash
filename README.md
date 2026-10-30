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

- You start last. Ride hard, and fight anyone who rides up beside you.
- To take a rider's club, throw a hit at them while they wind up a swing.
- Every hit costs stamina. A rider with no stamina left is knocked off their bike by the next hit.
- Crashes cost your bike condition. If it runs out, you are wrecked.
- After a crash, run back to your bike. A cop who reaches you before you remount busts you.
- `?seed=` in the address replays a race, and the results and pause screens show the race's seed.

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
