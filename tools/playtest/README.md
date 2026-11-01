# Play-test bots

Scripts that play the player's part in races ridden headless, to measure the game: how often a kind of player qualifies, how many hits they take, how often an opponent cuts across them. Every measured number in CHANGELOG.md comes from them. They are not players: read [What the bots don't do](#what-the-bots-dont-do) before trusting a number.

Nothing in the game imports them. `npm test`, the Next build and CI leave them out, since the whole set takes an hour; `npm run lint` and `npm run typecheck` check them.

## The bots

Each step a bot reads the race's snapshots, as a player reads the screen, and gives the input for the next step: whole presses of the throttle, brake and steering, as on a keyboard, and the punch and kick buttons. Its **pace** is its share of a safe pace: of the speed at which, braking at 10 m/s² for the bends ahead, a grip of 0.9 holds its line through them. The play-tests took 0.75 for a first-timer, 0.85 for an average rider, 0.92 for a decent one and 1.0 for an expert.

- **racer** (`racer.ts`): rides fast and clean and never attacks. On a straight it keeps 1.5 m right of the centreline, and it cuts in towards the inside of a bend. Every step it tries lines across the road, 0.25 m apart, keeps the one that stays clear of riders, cops, cars and obstacles longest nearest the line it wants, and slows for whatever it can only follow.
- **counter** (`counter-puncher.ts`), the counter-puncher: rides as the racer does and never starts a fight, but hits back at an opponent whose hit landed on it in the last 3 s, while that opponent is within reach: a punch, a kick one time in four, or a swing of a club it holds.
- **brawler** (`brawler.ts`): races as the racer does, but rides up alongside the nearest opponent from 6 m behind to 40 m ahead, at 18 m/s or faster, and hits it whenever it can. It takes a club by punching whoever winds up a swing within its reach. It never picks a fight with a cop.

Here "racer" and "brawler" name bots, not the opponents' temperaments.

### What the bots don't do

These are the bots' own faults, not the game's, but they blunt the measures where they show:

- They see the whole race in every snapshot and answer in the same step: no reaction time, nothing out of view. They judge a bend's safe speed and how fast their bike moves across with the Race module's own rules (`race-rules.ts`).
- They never look behind to make way for a faster rider, never stop on purpose, and never wait at their bike for a car to pass before getting back on, as a player could. That last bears on the remount rate.
- The fallen rock at 4,058 m pins them. In the 1.1.0 runs, 43 of the bots' 45 stops of 2 s or more were there, and in one race of 768 (Easy, the racer at 0.75, seed 33) the bot stands there until the 7-minute cap, with a cop standing in the road beside it for 23.8 s.
- They sit behind slow cars and rear-end them, which is most of their crashes into cars.
- They ride into slower riders. At full pace on Easy the racer runs into opponents 1.4 times a race (0.4 on Normal and Hard), and 21 of Easy's 34 run-ins are the bot riding into a slower rider's back or moving across into them. That is most of why Easy's player is knocked down more (48 in 192 races, against 25 and 18).
- They are three kinds of player at a few paces. The release notes' claims hold for those, not for a slower player or a first-timer who fights, whom no bot plays.

## Running them

Node 22.12 or newer, after `npm ci`. Logs go to `playtest-logs/` (git ignores it) in the folder you run npm from; `--out <folder>` puts them elsewhere.

### One run

```sh
npm run playtest -- normal racer 1.0 1-24
```

A run is a bot's races at a difficulty on a range of seeds: here the expert on Normal, seeds 1 to 24. It prints each race as it ends and writes `playtest-logs/working-tree/seeds-1-24/normal/racer-1.0.log`. A run of 24 races took 2½ to 4½ minutes on a 4-CPU machine busy with other work; the slower the bot, the longer its races.

A run writes its log as `<log>.part` and renames it to `<log>` once its last race is done. Ctrl+C (or SIGTERM) stops a run at once, leaving the `.part` file, which the next run of it replaces and the report ignores.

### The cut-in measure

```sh
npm run playtest -- cut-ins hard 1-24
```

The racer at full pace, with every run-in of it with an opponent sorted by who moved across into whom in the half second before. A *strict cut-across* is one where, half a second before, the racer's line cleared the opponent's bike by 0.8 m or more between their middles, and in that half second the opponent moved across towards the racer by at least 0.25 m, and by more than the racer moved towards it. The log goes to `.../seeds-1-24/hard/cut-ins.log`.

### The whole set

```sh
npm run playtest -- all
```

Everything behind the 1.1.0 release notes (`whole-set.ts`): every bot at its paces on every difficulty on seeds 1-24, the 48-seed claims' runs again on seeds 25-48, and the cut-in measure on each difficulty. That is 35 runs and 840 races, just under an hour two at a time on that machine. `--jobs` sets how many run at a time, half your CPUs unless given.

`all` leaves out the runs whose logs are already in the folder, so running it again after it was stopped rides only what is missing; `--redo` rides every run again. Ctrl+C (or SIGTERM) stops the runs under way, waits for them to end and starts no more: each leaves its log's `.part` file.

### The report

```sh
npm run playtest:report -- playtest-logs/working-tree
```

Prints each measured claim of the 1.1.0 release notes in their words, with the numbers behind it from the logs given (folders or files): positions, qualifying, hits, knock-offs, time alone, remounts, cut-ins and the riding claim's stalls, ± one standard error, each run's seed ranges apart and then together. A claim none of whose runs are in the logs says so, and the report starts by naming the whole set's runs it didn't find.

The report reads every `.log` under the folders it is given, and refuses two logs of the same races (a run's, or a difficulty's cut-ins, on a seed both have), naming both. So keep a try on other seeds, such as `npm run playtest -- normal racer 1.0 1-2 --out playtest-logs/try`, in a folder of its own.

### Comparing two commits

```sh
npm run playtest -- all                  # this checkout's src/race, uncommitted changes too
npm run playtest -- all --race v1.1.0    # v1.1.0's src/race, into playtest-logs/v1.1.0
npm run playtest:report -- playtest-logs/working-tree --against playtest-logs/v1.1.0
```

`--race <commit>` rides that commit's src/race with this checkout's bots. Any branch, tag or commit from v1.0.0 on works, such as `origin/main` (into `playtest-logs/origin-main`), `v1.1.0` or `0f8f3ea`. Commits before 2c512c8, such as v1.0.0, have no difficulties: they have one race, Normal's. On them a run refuses `easy` and `hard`, and `all` rides only the whole set's 11 Normal runs. With `--against`, the report sets the other logs beside these: every Normal run as two samples (this less that), as "plays as 1.0.0 did" was measured, then every run in both seed by seed, with the races that ended differently.

A race is deterministic: the same seed, difficulty and race code give the same race, so a change that doesn't touch a race leaves its log row byte for byte the same. `cmp` or `diff` between two runs' logs shows exactly which races changed. One run is enough to check a change you expect to touch few races; a change to the opponents' riding or fighting needs the whole set, and a change within about two standard errors may be chance.

## How the 1.1.0 numbers were made

The 1.1.0 release notes were measured with these bots and the whole set, on a build whose race code was 1.1.0's but for one doc comment. "Plays as 1.0.0 did" sets the Normal runs beside the same bots' runs on v1.0.0, and the cut-ins' "as in 1.0.0" sets them beside v1.0.0's Normal cut-in run. The report prints the numbers the notes quote:

- Easy, the first-timer (racer 0.75, seeds 1-48): mean position 8.2 ± 0.6, alone 11% ± 3% of the race, 0 knock-offs in 48. The average rider (racer 0.85): 31 of 48 qualified, 65% ± 7%.
- Normal against v1.0.0: on seeds 1-24, every bot within −2 and +3 qualifiers, 77 of 192 qualified against 75; the decent rider 21 against 24 of 48, the expert 35 against 33.
- Hard, the expert (racer 1.0): 21 of 48, 44% ± 7%. The counter-puncher 20 of 48, taking 5.0 hits a race against the racer's 5.0; at 0.92, 5.8 against 7.1. No knock-offs for either in 264 Hard races.
- In the riding claim's 120 races (Normal; the racer at its four paces and the brawler; seeds 1-24), every race ended and every rider got a time.
- Getting back on and crashing within 1 s: one race in 27 in the nine runs the figure was first measured on, one in 30 over every run. Strict cut-across run-ins at full pace: 11 in 9 races of 72, one race in 8.

This tool reproduces those runs byte for byte: `npm run playtest -- all` on 1.1.0 writes the same 35 logs, and `--race v1.0.0` rides the same v1.0.0 races (v1.0.0's racer logs were made before remounts were logged, so they lack those two fields). Figures from tuning experiments, such as ADR 0005's Easy at 0.94 of Normal's pace, came from the same bots on builds with the tuning changed: to repeat one, change `DIFFICULTY_TUNING` in a working tree and run.

Two measures behind the 1.1.0 checks aren't here: the waits behind a stopped player, which needed a recorder added to a copy of the Race module's contact rules, and the race checks' set-up sweeps, which set races up as the Race module's tests do.

## How it works

`playtest.mjs` bundles `main.ts`, the bots and the Race module (`@/race`: this checkout's src/race, or a copy of a commit's) into one script in a temporary folder with rolldown, then runs it. Rolldown comes with vitest, through vite, so the play-test needs no dependency of its own, and the races run as plain JavaScript, as fast as anywhere. If vitest ever stops bringing it, add rolldown to the devDependencies.

The bots read only what the race shows (snapshots, events and the track) and the four of its rules in `race-rules.ts`, so a change to the Race module that renames what they read fails `npm run typecheck`, which checks this folder against src/race (`tsconfig.json` here: Node's types, no DOM). The root `tsconfig.json` leaves `tools/` out, so the Next build neither checks nor bundles it.

### The logs

A run's log has a JSON row a race, then a `SUMMARY` line: the bot (`mode`), its settings (`cfg`, with the pace as typed), the race options (`opts`) and the races together. A row gives the race's outcome, position and time, the player's crashes by cause, knock-downs, fights, hits taken and landed, time alone and with someone within 10 m, the opponents' crashes and stalls, cops standing in the road, remounts and the crashes soon after one, and the field's times (`RaceRow` in `run.ts`). A cut-in log has a JSON line a run-in, a `RACE` line a race and a `SUMMARY` line. The formats are the 1.1.0 play-test's, so its logs compare with these.
