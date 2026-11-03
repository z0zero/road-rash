# Play-test bots

Scripts that play the player's part in races ridden headless, to measure the game: how often a kind of player qualifies, how many hits they take, how often an opponent cuts across them. Every measured number in CHANGELOG.md comes from them, but for those the notes say come from set-up rides (sweeps). They are not players: read [What the bots don't do](#what-the-bots-dont-do) before trusting a number.

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
- They never look behind to make way for a faster rider and never stop on purpose. Waiting by their bike for a car to go by before getting back on is the Race module's rule, for every rider, so they do that as a player does.
- The fallen rock at 4,058 m pins them. In the 1.1.0 runs, 43 of the bots' 45 stops of 2 s or more were there, and in one race of 768 (Easy, the racer at 0.75, seed 33) the bot stands there until the 7-minute cap, with a cop standing in the road beside it for 23.8 s. In the 1.2.0 runs, 4 races of 1,608 never ended there.
- They sit behind slow cars and rear-end them, which is most of their crashes into cars.
- They ride into slower riders. In the 1.1.0 runs, at full pace on Easy the racer ran into opponents 1.4 times a race (0.4 on Normal and Hard), and 21 of Easy's 34 run-ins were the bot riding into a slower rider's back or moving across into them. That is most of why Easy's player was knocked down more (48 in 192 races, against 25 and 18). In the 1.2.0 runs it ran into them 1.0 times a race on Easy (0.13 and 0.08 on Normal and Hard).
- They are three kinds of player at a few paces, and the release notes' claims hold for those. The whole set doesn't ride a slower player or a first-timer who fights: the 1.2.0 notes' figures for a slower player come from the racer at lower paces (see [How the 1.2.0 numbers were made](#how-the-120-numbers-were-made)).

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

Most of what is behind the 1.2.0 release notes (`whole-set.ts`): every bot at its paces on every difficulty on seeds 1-24, the 48-seed claims' runs again on seeds 25-48, and the cut-in measure on each difficulty. That is 35 runs and 840 races, just under an hour two at a time on that machine. `--jobs` sets how many run at a time, half your CPUs unless given. The notes' figures over 72 seeds, over 1,344 races and over 144 cut-in races also take the extra runs in [How the 1.2.0 numbers were made](#how-the-120-numbers-were-made).

`all` leaves out the runs whose logs are already in the folder, so running it again after it was stopped rides only what is missing; `--redo` rides every run again. Ctrl+C (or SIGTERM) stops the runs under way, waits for them to end and starts no more: each leaves its log's `.part` file.

### The report

```sh
npm run playtest:report -- playtest-logs/working-tree
```

Prints each measured claim of the 1.2.0 release notes in their words, with the numbers behind it from the logs given (folders or files): the crashes soon after getting back on, the crashes into cops and riders, cut-ins, positions, qualifying, hits, knock-offs, time alone and busts, ± one standard error, each run's seed ranges apart and then together (1-24, 25-48 and 49-72, then 1-48 and 1-72). A claim counted over "768 bot races" counts the whole set's races in the logs, whatever else they hold. A claim none of whose runs are in the logs says so, and the report starts by naming the whole set's runs it didn't find.

The report reads every `.log` under the folders it is given, each once however many times they reach it (a folder and a log in it, say), and refuses two logs of the same races (a run's, or a difficulty's cut-ins, on a seed both have), naming both, and a log it can't read, naming the line. So keep a try on other seeds, such as `npm run playtest -- normal racer 1.0 1-2 --out playtest-logs/try`, in a folder of its own.

### Comparing two commits

```sh
npm run playtest -- all                  # this checkout's src/race, uncommitted changes too
npm run playtest -- all --race v1.1.0    # v1.1.0's src/race, into playtest-logs/v1.1.0
npm run playtest:report -- playtest-logs/working-tree --against playtest-logs/v1.1.0
```

`--race <commit>` rides that commit's src/race with this checkout's bots. Any branch, tag or commit from v1.0.0 on works, such as `origin/main` (into `playtest-logs/origin-main`), `v1.1.0` or `0f8f3ea`. Commits before 2c512c8, such as v1.0.0, have no difficulties: they have one race, Normal's. On them a run refuses `easy` and `hard`, and `all` rides only the whole set's 11 Normal runs. With `--against`, the report sets the other logs beside these: each claim's counts in both, every Normal run as two samples (this less that), as the Normal claim was measured, the busts in every race both have, then every run in both seed by seed, with the races that ended differently.

A race is deterministic: the same seed, difficulty and race code give the same race, so a change that doesn't touch a race leaves its log row byte for byte the same. `cmp` or `diff` between two runs' logs shows exactly which races changed. One run is enough to check a change you expect to touch few races; a change to the opponents' riding or fighting needs the whole set, and a change within about two standard errors may be chance.

## How the 1.2.0 numbers were made

The 1.2.0 release notes were measured with these bots on the release's race code, each run set beside the same races on 1.1.0:

- the whole set (`npm run playtest -- all`): 768 races, and 72 cut-in races on seeds 1-24;
- 24 extra runs, 576 races: seeds 25-48 of the 15 whole-set runs it rides on seeds 1-24 only, all but Hard brawler 1.0; and seeds 49-72 of Easy racer 0.75 and 0.85, Normal racer 0.92 and 1.0 and counter 0.92, and Hard racer and counter at 0.92 and 1.0;
- the cut-in measure on seeds 25-48 (`npm run playtest -- cut-ins <difficulty> 25-48`), 72 more;
- the slower players: Easy racer 0.6 and 0.65 on seeds 1-48. Four more runs rode other players the whole set leaves out (Easy counter and brawler at 0.75 on seeds 1-48, Hard brawler 0.92 on seeds 1-48 and Hard brawler 1.0 on seeds 25-48); the notes quote none of them.

The report prints the numbers the notes quote. Give it the first three, then the slower players on their own, each `--against` the same runs on 1.1.0:

```sh
npm run playtest:report -- <whole set> <extra runs> <cut-ins 25-48> --against <the same on 1.1.0>
npm run playtest:report -- <slower players> --against <the same on 1.1.0>
```

- Getting back on: the player crashed within 1 s of getting back on 8 times in the whole set's 768 races (1.1.0: 26), and 10 times in all 1,344 (44), 9 of those 10 races ending in a bust.
- Opponents ran into cops 4 times in the whole set (1.1.0: 37). They crashed into a rider 243 times (721), and the player into an opponent 126 times (250).
- Cut-ins at full pace, seeds 1-48: no strict cut-across in 144 races (1.1.0: 20, in 18 races).
- Easy, seeds 1-48: the first-timer (racer 0.75) mean position 8.6 ± 0.6, alone 13% ± 3% of the race, 0 knock-offs in 48; the average rider (racer 0.85) 35 of 48 qualified, 73% ± 6%. Every Easy race of the whole set: 159 of 240 qualified (1.1.0: 132).
- Normal: every Normal run of the whole set on seeds 1-24, 73 of 192 qualified, against 1.1.0's 77 (and v1.0.0's 75, set `--against` v1.0.0's Normal runs). The expert (racer 1.0) over seeds 1-72: mean position 2.3, against 3.2.
- Hard: the expert (racer 1.0) 28 of 48 qualified, 58% ± 7%, and 41 of 72. The counter-puncher against the racer at 1.0, seeds 1-72: 35 against 41 qualified, 4.4 against 4.8 hits a race; at 0.92, 6.1 against 7.3. In the whole set's 264 Hard races of the two, 5 knock-offs (1.1.0: none), each in a race whose stamina had run out.
- Busts: 54 of the 1,344 races both builds have (1.1.0: 33).
- The slower players: the racer at 0.6 finished last or not at all in 48 of 48 races (1.1.0: 48), and at 0.65 in 42 of 48 (43).

The logs were made with a copy of these bots that also wrote down each wait by the bike, as a `waitList` in each row; its rows are otherwise this tool's, and its SUMMARY lines the same, as a run of this tool checked. This tool reproduces the 1.1.0 play-test's runs byte for byte: `npm run playtest -- all --race v1.1.0` writes the same 35 logs (checked again for 1.2.0 on Hard racer 1.0, seeds 1-24), and `--race v1.0.0` rides the same v1.0.0 races (v1.0.0's racer logs were made before remounts were logged, so they lack those two fields). Figures from tuning experiments, such as ADR 0005's Easy at 0.94 of Normal's pace, came from the same bots on builds with the tuning changed: to repeat one, change `DIFFICULTY_TUNING` in a working tree and run.

The notes' other numbers come from the race checks' set-up rides (sweeps), which aren't here: XB, XC, XE, CB and CP for the cops, OE2 and L1x for the opponents, W1 for getting back on, and the crash scan. They set races up as the Race module's tests do, on scratch copies of the Race module with a few exports added.

## How it works

`playtest.mjs` bundles `main.ts`, the bots and the Race module (`@/race`: this checkout's src/race, or a copy of a commit's) into one script in a temporary folder with rolldown, then runs it. Rolldown comes with vitest, through vite, so the play-test needs no dependency of its own, and the races run as plain JavaScript, as fast as anywhere. If vitest ever stops bringing it, add rolldown to the devDependencies.

The bots read only what the race shows (snapshots, events and the track) and the four of its rules in `race-rules.ts`, so a change to the Race module that renames what they read fails `npm run typecheck`, which checks this folder against src/race (`tsconfig.json` here: Node's types, no DOM). The root `tsconfig.json` leaves `tools/` out, so the Next build neither checks nor bundles it.

### The logs

A run's log has a JSON row a race, then a `SUMMARY` line: the bot (`mode`), its settings (`cfg`, with the pace as typed), the race options (`opts`) and the races together. A row gives the race's outcome, position and time, the player's crashes by cause, knock-downs, fights, hits taken and landed, time alone and with someone within 10 m, the opponents' crashes and stalls, cops standing in the road, remounts and the crashes soon after one, and the field's times (`RaceRow` in `run.ts`). A cut-in log has a JSON line a run-in, a `RACE` line a race and a `SUMMARY` line. The formats are the 1.1.0 play-test's, so its logs compare with these.
