# Changelog

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
