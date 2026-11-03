# Changelog

## 1.2.0 (2026-11-03)

The follow-ups to 1.1.0 (issue #15): you wait by your bike for a car to go by, cops and opponents look out for the riders around them, the screens fit more windows, and the play-test bots are in the repository.

### Riding

- **Getting back on.** Reach your bike as a car is about to come past and you wait beside it, out of the car's way, while the HUD says "Car coming!". You get back on once it has gone, or after 3 s on your feet at most.
  - Only a car that would run into the bike as you set off, or pass within 0.3 m of its side, keeps you waiting: not one standing still or crawling along in a queue, nor a cop or a rider.
  - Opponents wait too.
  - With a cop riding to bust you close by, you don't wait: you chance the car.
  - In 768 bot races, crashing again within a second of getting back on went from 26 times to 8.
- **Cops.**
  - A cop never pulls across the path of a rider or a car coming up behind it, and one riding to bust you, fighting back or pulling over brakes no harder than whoever is behind it can stop short of it. In 768 bot races, opponents ran into cops 4 times, against 37 in 1.1.0.
  - A cop riding to bust you after a crash pulls up beside you, on the side nearer the middle of the road where it can, and doesn't cross the path of a rider or a car behind it to get there unless every way would. If it would still go past you, it first gets out of the path of whoever is behind it, then brakes harder.
  - Once you are back on your bike, a cop following you that finds itself in front of you pulls onto the shoulder, rather than slow almost to a stop in the road.
  - A cop pulling over keeps to the side of the road it set off for, rather than cross to the far shoulder.
  - A cop backs up only to get round a stopped rider, at walking pace and with room behind it. The cars behind it no longer roll backwards: in set-up rides of a cop boxed in behind a stopped rider (sweep CP), none did, against 174 of 1,440 in 1.1.0.
- **Opponents.**
  - An opponent pulling out round a car, or back to its line, looks behind first. It doesn't pull across the path of a rider coming up behind who would be alongside within a second, closing fast enough to crash into it, and it keeps looking out for them until they are alongside or past. In 144 races of the expert racer bot at full speed, no opponent cut across it, against 20 times in 18 races in 1.1.0.
  - In the way of a car or a rock it can't stop short of, an opponent squeezes past through any gap its bike fits through, out onto the shoulder if need be, rather than run into it. With a rider still more than a second back and closing at little more than a bump, it gets out of the way in front of them.
  - A crawling opponent passes a slow car beside it, rather than be held at the car's back corner, and crosses a moving car's path only before the car comes alongside, at walking pace until it is across.
  - A queue waiting behind a stopped rider no longer sets off together and runs into them as they ride away.
  - An opponent brakes far ahead for a stopped or slow rider only when its line doesn't take it round them.
  - In 768 bot races, opponents crashed into a rider 243 times, against 721 in 1.1.0, and the player crashed into an opponent 126 times, against 250.

### Difficulty

No difficulty's tuning changed, but the riding changes moved the balance. Measured again with the play-tests' bots over 48 seeds, or 72 where it says so:

- **Easy:** a first-timer (riding at 75% of a safe pace) still finishes 8th on average, seldom alone (13% of the race) and never knocked off. An average rider qualifies in two races of three or a little more (35 of 48). The better bots qualify more often than in 1.1.0: 159 of the 240 Easy races, against 132.
- **Normal:** qualifying is as in 1.0.0 and 1.1.0, within the play-test's noise (73 of 192 races on seeds 1-24, against 75 and 77), and the expert finishes a little higher (2.3 on average over 72 seeds, against 3.2).
- **Hard:** an expert now qualifies in about three races of five (28 of 48, and 41 of 72), up from two of five. One who hits back takes no more hits and qualifies about as often: over 72 seeds, 4.4 hits a race against 4.8, and 35 races qualified against 41. At a slower pace, one who hits back takes fewer hits (6.1 against 7.3 a race, over 72 seeds). A club still can't knock you off from full stamina: in 264 Hard races, the racer and the counter-puncher bots were knocked off 5 times, each time after their stamina had run out.

### Look

- The title screen fits windows narrower than 1024 px and less than 592 px tall, such as 768×576, without scrolling.
- With a larger browser font, the screens switch to their tighter spacing in taller windows too: with Chrome's font size at Large (20 px), the results and the title no longer scroll in windows 768 to 944 px tall at 1280 px wide.
- Controls' table fits its panel in narrow windows with a larger browser font, such as 480 px wide with a 20 px font.

### Play-testing (for developers)

- The play-test bots are in the repository, in `tools/playtest`. `npm run playtest` rides a bot (the racer, the counter-puncher or the brawler) through headless races and logs them, `npm run playtest -- all` rides the whole set behind most of these notes' numbers (about an hour), and `npm run playtest:report` prints these notes' measured claims from the logs, beside another commit's with `--race` and `--against`. See `tools/playtest/README.md`.
- Smoke tests: a race's results must fit a 1280×768 window with the full spacing, a ride checks the "Car coming!" wait, and the longer gamepad rides have a slow test's time limit.

### Known limitations

- Desktop only: a touch-only phone or tablet gets a notice instead of the game, and the game needs WebGL 2.
- In Safari, and in Firefox before 155, a race started with a gamepad still has no sound until you press a key or click. The game says so.
- A cop riding to bust you brakes no harder than the riders behind it can, and no longer cuts across a car's path to get out of their way, so it reaches you sooner after a crash, and some crashes you got away from in 1.1.0 now end in a bust: 54 of the 1,344 bot races ridden on both ended in a bust, against 33 in 1.1.0.
- With riders or a car close behind it, a cop riding to bust you at speed can go past you before it stops, since it brakes only as hard as they can. The numbers come from set-up rides (sweeps) of the release's race code:
  - Where 1.1.0's cop stopped within 2 m of the crashed rider, it now goes 2.4 to 12 m past in 270 of 3,456 set-ups with riders or a car following it (sweep XB), 2.2 to 12 m in 387 of 3,840 with followers in two lanes or off its line (sweep XE), and 2.2 to 20 m in 78 of 1,152 with a second cop riding to the same crash (sweep XC). It busts up to 2.7 s later than 1.1.0's (XB).
  - Coming fast on a crash just in front of it, it goes up to 10.2 m past (16 of 264 set-ups more than 2 m past, sweep CB).
  - In the crash scan's 180 races, with the player riding into a car 8 s after a cop joins, it stops within 2 m of the player in 179. In the other, a rider behind it holds it to gentle braking, it goes 5.2 m past, and the player gets back on.
  - With you lying in the oncoming lane, a car following the cop and another coming the other way, it can stop level with you, out of reach, and stand there without busting you (3 of the XE set-ups).
- Getting back on just as a car comes past can still crash you again, about one race in 100 (8 in 768 bot races, against 26 in 1.1.0).
  - With a cop riding to bust you close by, you don't wait for the car: 9 of the 10 such crashes in 1,344 bot races came that way, and each of those races ended in a bust. The tenth was a car just past the half-second look-ahead.
  - In set-up rides (sweep W1), 30 of 295 still crash within 2 s: a bike jammed against a roadside sign and pushed into a car's way, cars that arrive after the look-ahead, and tightly packed crawling queues after the 3 s wait.
  - A car already on you as you reach your bike can still knock you down.
- An opponent in the way of a car or a rock it can't stop short of stops looking out for a rider more than a second back who closes on it at little more than a bump. Right at that boundary, as it brakes or speeds up, it can start round on the rider's side, then turn back and clip the corner of what it was avoiding. Set-up rides (sweep OE2) show it in 40 of 19,360, all with the rider 1.1 s back: into a car or a rock at 9.6 to 20.6 m/s, or, in 4, against a car coming the other way at 43 m/s.
- Brake to a dead stop in an opponent's lane, with a car alongside it so that it has no way round you, and it can still run into you, as in 1.1.0: in 298 of 1,008 set-up rides at 25 to 50 m/s (sweep L1x), against 300. One already stopped there is run into less: in 53 of 576, against 154.
- A player much slower than a first-timer has little chance on Easy, as in 1.1.0: riding at 60% of a safe pace, the racer bot finished last or not at all in all 48 races, and at 65% in 42 of 48.
- In windows narrower than 1024 px, Controls and the results scroll, and the title can scroll at 480 to 530 px wide and 576 to 640 px tall. With a 20 px browser font at 1280 px wide, the title scrolls in windows 576 to 709 px tall and the tallest results 576 to 681, and Controls spills over at 360 to 400 px wide (at 480 to 543 px with a 24 px font).
- @react-three/fiber 9.8.2 logs a `THREE.Clock` deprecation warning, and no 9.x release fixes it yet.
- The game has been play-tested in headless Chromium with software rendering only. It hasn't been checked on many real graphics cards yet.

## 1.1.0 (2026-11-01)

Choose how hard the race is, plus the follow-ups to 1.0.0 (issue #13).

### Difficulty

- Choose Easy, Normal or Hard under Start Race, with the mouse, the keyboard or a gamepad. The game remembers your choice.
  - **Normal** keeps 1.0.0's tuning.
  - **Easy** is for a first race. Opponents:
    - ride 11% slower;
    - attack you half as often;
    - wait 5 s after each hit on you;
    - leave you alone for a while after two hits you don't answer.

    Catch-up also keeps the field closer to you when you fall behind.
  - **Hard** is for players who have qualified on Normal. Opponents:
    - ride 7% faster;
    - attack you twice as often;
    - wait only 1 s after each hit on you;
    - leave you alone for a while after four hits you don't answer, before a club can knock you off from full stamina.
  - On Easy and Hard, an opponent also waits after hitting you when you fight back, as when you don't.
- Measured with the play-tests' bots over 48 seeds:
  - **Easy:** a first-timer (riding at 75% of a safe pace) finishes 8th on average, seldom alone and never knocked off. An average rider qualifies in two races of three.
  - **Normal:** plays as 1.0.0 did.
  - **Hard:** an expert qualifies in about two races of five, and one who hits back does as well. At a slower pace, one who hits back takes fewer hits than one who doesn't.
- Each difficulty keeps its own personal best. A 1.0.0 personal best becomes Normal's.
- The pause and results screens show the difficulty beside the race's seed.
- `?seed=17&difficulty=hard` in the address replays a race at a difficulty. A seed alone, as in 1.0.0's addresses, replays it on Normal.

### Riding

- A car knocks down a rider on foot only when it drives into them. A car standing still, one going their way slower than them, or one already half past them pushes them clear instead.
- Riders and cops behind you no longer wait there for as long as you stand still: riders go round you where there's room, even at the roadside's edge, and a cop comes up beside you. One that has all but stopped right behind you still waits for you to move off, rather than push you. A rider pinned against the roadside squeezes past at walking pace. In 120 bot races, the riders left stuck like that went from 8 to 0.
- A slow rider boxed in on an oncoming car's line squeezes out of its way.

### Controls and look

- The gamepad's B goes back from Controls, Settings, Credits, the pause menu and the results, as Esc does. Esc now also goes back from the results.
  - Both work wherever the focus is.
  - A key or button held over from the race doesn't close the results.
- The arrow keys move through the menus as the D-pad does: up and down between buttons, left and right along a slider or the difficulty.
- A gamepad's stick or D-pad pushed between two ways, down and right say, moves through a menu one way only, so it no longer also turns the volume slider it moves onto.
- Esc pauses and goes back wherever your keyboard puts it, such as on Caps Lock.
- Some browsers keep the sound locked when a gamepad starts the race (Safari, and Firefox before 155). A note now says that a key press or a click turns the sound on.
- Every screen fits in windows down to 1024×576 without scrolling. In windows less than 768 px tall, as on many laptops, the screens use tighter spacing.
- Hillsides inside bends are calmer, and the land builds faster at page load.

### Known limitations

- Desktop only: a touch-only phone or tablet gets a notice instead of the game, and the game needs WebGL 2.
- In Safari, and in Firefox before 155, a race started with a gamepad still has no sound until you press a key or click. The game now says so.
- Getting back on the bike just as a car comes past can crash you again at once (about one race in 27, as in 1.0.0).
- An opponent pulling out round a car, or back to its line, doesn't look behind it, so it can cut across a much faster rider coming up behind (at full speed, about one race in eight, as in 1.0.0).
- @react-three/fiber 9.8.2 logs a `THREE.Clock` deprecation warning, and no 9.x release fixes it yet.
- The game has been play-tested in headless Chromium with software rendering only. It hasn't been checked on many real graphics cards yet.

## 1.0.0 (2026-10-30)

The first release of Rev & Wreck: one complete race in the browser.

### The game

- One race on a winding coastal cliff road at sunset, against fourteen opponents. You start last; finish third or better to qualify.
- Fight as you ride: punch, kick, and take a club from a rider who swings one at you. Stamina and bike condition are tracked separately. A knock-off or a crash throws you off your bike, and you run back to it.
- Traffic in both directions, rocks and signs on the road, and two cops who join the race as you pass them. Crash near a cop and you can be busted before you get back on your bike. You can fight a cop, but it fights back with a club.
- The race ends Finished, Wrecked or Busted. The results show the full standings with times, your personal best, a remark from an opponent or a cop, and the race's seed (`?seed=` in the address replays a race).
- Keyboard (W/A/S/D or the arrow keys, J or Z to punch, K or X to kick) or a standard gamepad, which also gets round the menus. Screens: Controls, Settings (volumes, Reduce motion) and Credits.
- Stylized low-poly 3D with bloom, colour grading and speed effects, with every model built in code. Synthesized engines, hits, skids and a siren placed where the cop is. The race music is "Hot Roadway [Remake]" by MintoDog (CC0).
- A static Next.js site, deployed on Vercel.

### Changes since the first preview

- **Cops:**
  - A crash with a cop following at its usual gap can now be escaped: the cop rides to the crash at an arrest pace, and you get away if you head straight back to your bike.
  - Cops have bodies: riders bump them, and cars and opponents slow for them.
  - Cops pull onto the shoulder to wait.
  - The siren comes from the cop's side and fades with distance.
- **Fights:**
  - Brawlers and bullies take turns at you instead of ganging up.
  - A fighter eases off a rider who doesn't hit back, and gives up on one who rides slowly.
  - A first-time player gets a "Hit back!" prompt showing their own punch and kick buttons.
  - A club now knocks riders off clearly faster than fists.
- **The road:**
  - Opponents steer round traffic and cops, cutting their crashes from about 8 a race to under 1.
  - Cars slow behind slower riders and stop short of fallen rocks, and no car drives through the start grid.
  - A rider who runs into the back of a car lands behind it instead of inside it.
  - Bikes stopped against something steer round it instead of stalling.
- **Results:** the rest of the field races to the finish a few milliseconds a frame, so finishing never freezes the game, and every rider gets a time.
- **Look and controls:**
  - Fixed the occasional all-black frame.
  - Cars grow into view instead of popping in.
  - The results screen no longer restarts the race on a stray gamepad press.
  - Ctrl, Cmd and Alt shortcuts are left to the browser.
- **Code:**
  - The race rules were split from one 960-line file into modules by rule, without changing behaviour.
  - Units, names and test fixtures were tidied.

### Known limitations

- Desktop only: a touch-only phone or tablet gets a notice instead of the game, and the game needs WebGL 2.
- In Safari, and in Firefox before 155, a race started with a gamepad press has no sound until you press a key or click, because those browsers don't count a gamepad press as a user action.
- The gamepad has no "B to go back" on the menus.
- The game was play-tested in headless Chromium with software rendering; it hasn't been checked on many real graphics cards yet.
