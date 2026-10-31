# Rev & Wreck

A browser motorcycle combat racing game inspired by Road Rash on the SEGA Genesis: riders race each other on public roads and fight along the way.

## Language

### Racing

**Race**:
One competition from the start line to the finish line on one track.
_Avoid_: Match, round, stage, level

**Seed**:
The number a race is created from, with its difficulty: every random choice the race makes follows from it, from the order of the start grid to the traffic, so the same seed, difficulty and inputs give the same race. The pause and results screens show it beside the difficulty, and a page address that asks for both replays the race: races it again from the same start. The track has a seed of its own, fixed in the code, so every race is run on the same road.
_Avoid_: Race ID, race number, code

**Track**:
The stretch of road a race is run on.
_Avoid_: Course, map, route

**Start grid**:
Where the riders line up for the start: the player last, the opponents ahead of them in groups of two or three.
_Avoid_: Spawn, starting line-up

**Position**:
A rider's rank in the race, from first (the leader) to last. Wrecked and busted riders have no position.
_Avoid_: Place, rank, standing

**Standings**:
Every rider's final position and finishing time once the race is over, or how their race ended, as the results list them. One rider's row is never "a standing": it is their position.
_Avoid_: Ranking, leaderboard, scoreboard

**Qualified**:
Having finished a race in third position or better.
_Avoid_: Won, passed

**Personal best**:
The player's fastest finishing time and best position on a difficulty, each from any race they finished on it, kept in the browser between visits. Each difficulty keeps its own, since times on one don't compare with times on another.
_Avoid_: Record, high score, PB

**Remark**:
A one-line comment on how the player's race went, from an opponent or a cop, shown with the results.
_Avoid_: Quote, quip, taunt, banter

**Difficulty**:
How hard the opponents make a race: Easy, Normal or Hard, chosen on the title screen. On Easy they ride slower, attack the player less often, give them longer breathers and lose patience sooner, and catch-up holds them nearer the player; on Hard they ride closer to the limit and fight more. On both, a player who hits back still gets their breathers. Normal is tuned as v1.0.0 was. The track, the start grid and the rules for the traffic and the cops are the same on every difficulty, though the cars and cops then react to how the opponents ride; and each difficulty keeps its own personal best.
_Avoid_: Level, mode, skill

### Riders

**Rider**:
A person taking part in a race, whether on their bike or on foot after a crash. Cops are not riders.
_Avoid_: Racer, biker, driver

**Player**:
The rider controlled by the person playing the game.
_Avoid_: User, hero

**Opponent**:
A rider controlled by the game's AI.
_Avoid_: Enemy, bot, NPC

**Catch-up**:
Opponents far behind the player riding a little faster than their usual pace, and those far ahead a little slower, so the field stays near the player: up to 8%, from 75 m away to its most at 400 m, and on Easy from 25 m to its most at 150 m.
_Avoid_: Rubber-banding

**Temperament**:
How an opponent races and fights: a *racer* concentrates on racing and rarely attacks, a *brawler* attacks often, and a *bully* attacks often and starts the race with a weapon. "Racer" names a temperament here, never a rider.
_Avoid_: Personality, style, AI type

**Skill**:
How close to the limit an opponent rides, compared with the rest of the field, from 0 (the least skilled) to 1 (the most); the difficulty then moves the whole field nearer the limit or further from it (see Pace). Racers are the most skilled.
_Avoid_: Level, difficulty, rating

**Pace**:
How fast an opponent rides when nothing gets in its way: a share of the fastest it could safely go at each point of the track, higher the more skilled it is and the harder the difficulty (0.89 times Normal's on Easy, 1.07 times on Hard). Catch-up and its intent raise or lower it a little.
_Avoid_: Target speed, cruising speed

**Intent**:
What an opponent is riding for at the moment: just racing, riding up alongside a rider to fight them, waiting its turn to fight the player, or dropping back.
_Avoid_: AI state, mode, goal

**Patience**:
How long a brawler or bully keeps riding alongside a player who rides well below its own pace, or who doesn't hit back. It wears thin while the player rides slowly beside it and builds back up while they keep up, and it runs out at once when three of its hits in a row (two on Easy, four on Hard) have landed on a player who isn't fighting it back. Once it runs out, the opponent gives up on the player and just races, attacking them only if they hit it, until its patience is whole again.
_Avoid_: Tolerance, temper

**Bike**:
The motorcycle a rider races on.
_Avoid_: Motorcycle, motorbike, vehicle

**Livery**:
A rider's or a cop's colours: their bike's paint and stripes, their jacket and their helmet. Every cop wears the same one.
_Avoid_: Skin, colour scheme, paint job

**Stamina**:
How much fight a rider has left. Every hit lowers it, it slowly recovers, and a rider with no stamina left is knocked off their bike by the next hit.
_Avoid_: Health, HP, energy, life

**Condition**:
How intact a bike is, from full to empty. It drops with every crash, and a bike whose condition runs out is wrecked.
_Avoid_: Damage, durability, bike health

**Bump**:
A rider on their bike running into another rider on a bike, a cop, a car or an obstacle at a small speed difference (under 8 m/s) and being pushed apart, without crashing. A cop bumps off whatever it runs into, whatever the speed difference. A bike that bumps a car or an obstacle with no room to pass it on one side, before the edge of the shoulder, is pushed to its other side.
_Avoid_: Nudge, collision

**Squeezing past**:
An opponent, or a cop, held to a standstill by what is in its way with no clear way round it, as when a rider stands beside it with a roadside rock ahead, rolling on at walking pace through the nearest gap its bike fits through, never across the path of a car close ahead. Boxed in like that in the path of a car coming at it, it squeezes out of the car's way. An opponent goes out onto the shoulder for it if need be, and so does a cop riding to bust someone or pulling over; a cop on patrol or fighting back squeezes past only on the road. Held back behind a rider who has all but stopped, it rolls on round them at walking pace too, rather than wait behind them: on its side of them, or on their other side if its own has no room for its bike before the edge it squeezes out to.
_Avoid_: Nudging through, forcing past

**Run-in**:
Two riders on their bikes, or a rider and a cop, running into each other at a larger speed difference than a bump: the faster rider crashes. A cop never does: the spec puts a cop out of the race only when it is beaten in a fight, so a cop that runs into a rider only bumps them.
_Avoid_: Collision, impact

**Crash**:
A rider being thrown off their bike, either by a hit or by running into something. After a crash the rider is on foot and runs back to their bike.
_Avoid_: Wipeout, bail, fall, spill

**Knock-off**:
A crash caused by a hit landing on a rider who has no stamina left. A cop with no stamina left is knocked off by the next hit too, and is out of the race. Not a knock-down, which only a car does, to a rider on foot.
_Avoid_: KO, knocked out

**On foot**:
A rider off their bike after a crash, once they have stopped tumbling along the road: they run back to their bike and get back on it, which is remounting.
_Avoid_: Running, walking, dismounted

**Knock-down**:
A car driving into a rider on foot and throwing them to the ground: they tumble again, then get up and carry on back to their bike. It is not a crash, so it costs their bike nothing. Not a knock-off, which a hit does. Only a car closing in on them along its own way, at over 1 m/s, with them in front of its middle, knocks them down; one coming at them that fast does even if they run into it. One going their way, slower than them, that they catch up or brush as they run away from it only pushes them clear of it, and they go round it; so does one standing still, or one already half past them when they touch it.
_Avoid_: Run over, hit

**Wrecked**:
The end of a rider's race because their bike's condition ran out.
_Avoid_: Totaled, destroyed, DNF

### Fighting

**Attack**:
A punch, kick or club swing aimed at the nearest rider within reach. Punches and club swings lower stamina; a kick mostly shoves its target sideways.
_Avoid_: Strike, move, hit (for the action)

**Reach**:
How far from an attacker an attack can land: up to 2 m along the track and, on either side, 1.8 m across it (2.4 m for a club swing).
_Avoid_: Range

**Wind-up**:
The moment between throwing an attack and its striking; after it strikes comes a short recovery before the next attack.
_Avoid_: Charge, startup

**Dropping back**:
A badly beaten opponent easing off and keeping out of fights until it has recovered its stamina.
_Avoid_: Retreating, fleeing

**Turn**:
A brawler's or bully's go at fighting the player. One at a time rides alongside them and attacks them; any others that want to fight them wait their turn, holding back behind them (or racing on, if they are ahead), and don't attack them unless the player hits them. Once the one fighting stops, the nearest of the others takes its turn.
_Avoid_: Queue, slot

**Breather**:
The 3 s (5 s on Easy, 1 s on Hard) an opponent whose hit has just landed on the player gives them before it attacks them again. On Normal it gives none to a player who is fighting it back, who has hit it in the last 5 s; on Easy and Hard it gives them one all the same, so hitting back never brings its attacks on faster.
_Avoid_: Cooldown, grace period

**Weapon**:
A club a rider swings instead of punching. A rider takes one with a hit thrown at its holder during the wind-up of a swing, and drops it in a crash.
_Avoid_: Item, power-up, tool

**Club swing**:
The attack a rider holding a club makes instead of a punch.
_Avoid_: Weapon swing, swipe, bash

**Hit-back prompt**:
The HUD's reminder of the keys or gamepad buttons to punch and kick with, shown for a few seconds when an opponent's hit lands on a player who has never attacked in a race. It goes as soon as they attack, and once they have, it never shows again.
_Avoid_: Tutorial, tip, hint

### The road

**Lane**:
One of the road's four 3 m strips: the two right of the centreline carry traffic in the race direction, the two left of it oncoming traffic. Riders may ride anywhere on the road.
_Avoid_: Carriageway

**Shoulder**:
The strip of gravel beyond either edge of the road, where a bike slows sharply and obstacles stand. Nobody rides beyond it. A rider on a shoulder is off the road.
_Avoid_: Verge, kerb

**Car**:
One of the traffic's cars: a hatchback, saloon, van or pickup, driving in the race direction in the right lanes or oncoming in the left lanes. Some change lanes now and then.
_Avoid_: Vehicle, NPC

**Closed road**:
A road with no traffic, which a test can set a race up on, with cars where it puts them if it needs one in a rider's way, each standing still or driving on at a steady speed; the game's races always run in traffic.
_Avoid_: Empty road, private road

**Traffic**:
The civilians' cars on the road, which are not part of the race.
_Avoid_: NPC cars, obstacles

**Obstacle**:
A fixed object on or beside the road, such as a rock or a sign, that makes a rider who runs into it crash, unless they run into it slower than 8 m/s, when they only bump off it.
_Avoid_: Hazard, barrier

**Footprint**:
Where a car or an obstacle is on the road, how much of it it covers, how fast it moves along it and, for a car changing lanes, the lane it is moving over to: what riders steer around and run into. Opponents see a cop's bike the same way, slowing down in time for a slower one in their path.
_Avoid_: Hitbox, bounds

**Scenery**:
Everything beside the road that nobody can hit: palms, pines, rocks, houses, signs and guard rails beyond the shoulders.
_Avoid_: Props, decoration

**Cop**:
A police officer on a motorcycle who rides among the riders and busts anyone who crashes nearby. Two cops wait on the shoulder and join the race as the player passes them, then stay near the player.
_Avoid_: Police, officer

**Patrol**:
What a cop in the race does when nobody needs busting: riding near the player, the cops taking turns to follow them about 1.5 s behind while the other holds well back. While the player is down after a crash it isn't riding to, a cop on patrol pulls over onto the shoulder, and so does one holding back from a player who rides slowly, rather than slow almost to a stop in the race's lanes. A cop never pulls across the path of a rider or a car coming up behind it, and cars slow down for a slower cop in their lane as for a slower rider.
_Avoid_: Chase, pursuit

**Standing by**:
A cop staying by a rider it has busted for a few seconds, pulled over onto the shoulder, before riding on.
_Avoid_: Waiting, idling

**Cop alert**:
The warning on the HUD, with the siren, that a cop in the race is near the player: within 150 m.
_Avoid_: Wanted level, police alert

**Fighting back**:
A cop hit by a rider coming after them and swinging its club at them, until a while after it was last hit.
_Avoid_: Revenge, aggro

**Busted**:
The end of a rider's race because a cop caught them after a crash: a cop within 80 m of a rider who crashes rides to them at the arrest pace, and busts them if it reaches them, once they are on their feet, before they are back on their bike.
_Avoid_: Arrested, caught, jailed

**Arrest pace**:
How fast a cop rides to a crashed rider to bust them: braking down to 8 m/s at once, and no faster all the way, so that a rider who crashes close in front of a cop is caught, and one who crashes with it following at its usual gap can run back to their bike first.
_Avoid_: Chase speed, pursuit speed
