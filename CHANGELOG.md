# Changelog

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
