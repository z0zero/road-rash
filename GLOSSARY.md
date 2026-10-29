# Rev & Wreck

A browser motorcycle combat racing game inspired by Road Rash on the SEGA Genesis: riders race each other on public roads and fight along the way.

## Language

### Racing

**Race**:
One competition from the start line to the finish line on one track.
_Avoid_: Match, round, stage, level

**Track**:
The stretch of road a race is run on.
_Avoid_: Course, map, route

**Position**:
A rider's rank in the race, from first (the leader) to last. Wrecked and busted riders have no position.
_Avoid_: Place, rank, standing

**Qualified**:
Having finished a race in third position or better.
_Avoid_: Won, passed

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
Opponents far behind the player riding a little faster than their usual pace, and those far ahead a little slower, so the field stays near the player.
_Avoid_: Rubber-banding

**Temperament**:
How an opponent races and fights: a *racer* concentrates on racing and rarely attacks, a *brawler* attacks often, and a *bully* attacks often and starts the race with a weapon. "Racer" names a temperament here, never a rider.
_Avoid_: Personality, style, AI type

**Bike**:
The motorcycle a rider races on.
_Avoid_: Motorcycle, motorbike, vehicle

**Livery**:
A rider's colours: their bike's paint and stripes, their jacket and their helmet.
_Avoid_: Skin, colour scheme, paint job

**Stamina**:
How much fight a rider has left. Every hit lowers it, it slowly recovers, and a rider with no stamina left is knocked off their bike by the next hit.
_Avoid_: Health, HP, energy, life

**Condition**:
How intact a bike is, from full to empty. It drops with every crash, and a bike whose condition runs out is wrecked.
_Avoid_: Damage, durability, bike health

**Bump**:
Two riders on their bikes running into each other at a small speed difference and being pushed apart, without either of them crashing.
_Avoid_: Nudge, collision

**Crash**:
A rider being thrown off their bike, either by a hit or by running into something. After a crash the rider is on foot and runs back to their bike.
_Avoid_: Wipeout, bail, fall, spill

**Knock-off**:
A crash caused by a hit landing on a rider who has no stamina left. A cop with no stamina left is knocked off by the next hit too, and is out of the race.
_Avoid_: KO, knockdown

**On foot**:
A rider off their bike after a crash, once they have stopped tumbling along the road: they run back to their bike and get back on it, which is remounting.
_Avoid_: Running, walking, dismounted

**Knock-down**:
A car running into a rider on foot and throwing them to the ground: they tumble again, then get up and carry on back to their bike. It is not a crash, so it costs their bike nothing.
_Avoid_: Run over, hit

**Wrecked**:
The end of a rider's race because their bike's condition ran out.
_Avoid_: Totaled, destroyed, DNF

### Fighting

**Attack**:
A punch, kick or weapon swing aimed at the nearest rider within reach. Punches and weapon swings lower stamina; a kick mostly shoves its target sideways.
_Avoid_: Strike, move, hit (for the action)

**Reach**:
How far from an attacker an attack can land: up to 2 m along the track and, on either side, 1.8 m across it (2.4 m for a weapon swing).
_Avoid_: Range

**Wind-up**:
The moment between throwing an attack and its striking; after it strikes comes a short recovery before the next attack.
_Avoid_: Charge, startup

**Dropping back**:
A badly beaten opponent easing off and keeping out of fights until it has recovered its stamina.
_Avoid_: Retreating, fleeing

**Weapon**:
A club a rider swings instead of punching. A rider takes one by hitting its holder in the middle of a swing, and drops it in a crash.
_Avoid_: Item, power-up, tool

### The road

**Lane**:
One of the road's four 3 m strips: the two right of the centreline carry traffic in the race direction, the two left of it oncoming traffic. Riders may ride anywhere on the road.
_Avoid_: Carriageway

**Shoulder**:
The strip of gravel beyond either edge of the road, where a bike slows sharply and obstacles stand. Nobody rides beyond it.
_Avoid_: Verge, kerb

**Car**:
One vehicle of the traffic: a hatchback, saloon, van or pickup, driving in the race direction in the right lanes or oncoming in the left lanes. Some change lanes now and then.
_Avoid_: Vehicle, NPC

**Closed road**:
A road with no traffic, which a race can be set up on.
_Avoid_: Empty road, private road

**Traffic**:
Civilian vehicles on the road that are not part of the race.
_Avoid_: NPC cars, obstacles

**Obstacle**:
A fixed object on or beside the road, such as a rock or a sign, that makes a rider who runs into it crash.
_Avoid_: Hazard, barrier

**Scenery**:
Everything beside the road that nobody can hit: palms, pines, rocks, houses, signs and guard rails beyond the shoulders.
_Avoid_: Props, decoration

**Cop**:
A police officer on a motorcycle who rides among the riders and busts anyone who crashes nearby. Two cops wait on the shoulder and join the race as the player passes them, then stay near the player.
_Avoid_: Police, officer

**Cop alert**:
The warning on the HUD, with the siren, that a cop in the race is near the player: within 150 m.
_Avoid_: Wanted level, police alert

**Fighting back**:
A cop hit by a rider coming after them and swinging its club at them, until a while after it was last hit.
_Avoid_: Revenge, aggro

**Busted**:
The end of a rider's race because a cop caught them after a crash.
_Avoid_: Arrested, caught, jailed
