/**
 * Scripted riding for the Race module's tests. Everything here drives a race
 * through its interface and reads only what any caller can: snapshots and the
 * track. The one way past the interface is `setUpRace`, which sets a race up
 * for a test (see `TestSetup`).
 */
import {
  NO_INPUT,
  PLAYER,
  STEP_SECONDS,
  type AttackKind,
  type CarSnapshot,
  type ObstaclePlacement,
  type PlayerInput,
  type Race,
  type RaceEvent,
  type RaceSnapshot,
  type RiderId,
  type RiderSnapshot,
  type Moving,
  type Side,
  type Temperament,
  type Track,
  type TrackPosition,
} from ".";
import { setUpRace, type TestSetup } from "./race";

export { setUpRace, type TestSetup };

export const STEPS_PER_SECOND = 60;
export const FULL_THROTTLE: PlayerInput = { ...NO_INPUT, throttle: 1 };

/** The player, as events name them. */
export const ME = { kind: "rider", id: PLAYER } as const;
/** A rider, as events name them. */
export const rider = (id: RiderId) => ({ kind: "rider", id }) as const;
/** The first cop, as events name it. */
export const FIRST_COP = { kind: "cop", id: 0 } as const;

export type AttackThrown = Extract<RaceEvent, { type: "attack-thrown" }>;
export type Crash = Extract<RaceEvent, { type: "crash" }>;
export const isCrash = (event: RaceEvent): event is Crash => event.type === "crash";
export const playerCrashed = (event: RaceEvent): event is Crash => isCrash(event) && event.rider === PLAYER;

/**
 * The time limit of a test that rides whole races, or most of one: a race
 * takes a few seconds on a quiet machine and several times as long on a busy
 * one, so these get far more than the 30 s every other test gets.
 */
export const WHOLE_RACES = { timeout: 300_000 } as const;

/** Sets a race up on a closed road, with no traffic. */
export const CLOSED_ROAD: TestSetup = { traffic: "closed" };

/** Sets a race up with no cops, so that nobody is busted. */
export const NO_COPS: TestSetup = { cops: false };

/** km/h in metres per second. */
export function kmh(value: number) {
  return value / 3.6;
}

export function stepFor(race: Race, seconds: number, input: PlayerInput = NO_INPUT) {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let i = 0; i < steps; i++) race.step(input);
}

/** A race whose countdown has just run out, set up as `setup` says. */
export function startedRace(seed = 1, setup: TestSetup = {}) {
  const race = setUpRace({ seed }, setup);
  stepFor(race, 3);
  race.drainEvents();
  return race;
}

/** A started race, set up as `setup` says, in which the field has ridden off for 40 s, leaving the player on their own on the start line. */
export function leftOnTheirOwn(seed = 1, setup: TestSetup = {}) {
  const race = startedRace(seed, setup);
  stepFor(race, 40);
  return race;
}

export function player(race: Race) {
  return race.snapshot().riders[PLAYER];
}

/** Steps with `input` until `done` holds, and returns how many seconds that took. */
export function secondsUntil(
  race: Race,
  input: PlayerInput | (() => PlayerInput),
  done: () => boolean,
  limitSeconds = 600,
) {
  let steps = 0;
  while (!done()) {
    if (steps >= limitSeconds * STEPS_PER_SECOND) throw new Error(`not done within ${limitSeconds} s`);
    race.step(typeof input === "function" ? input() : input);
    steps++;
  }
  return steps * STEP_SECONDS;
}

/**
 * Scripted input that rides the bike along the track near `lane` (an offset
 * from the centreline) at up to `targetSpeed`, braking for the bends ahead
 * and, like any careful rider, keeping clear of the riders, cops, cars and
 * obstacles on the road: it never steers across anything it is about to
 * reach or is alongside, gets out of the way of what comes at it, and
 * follows a slower rider or car in its path until it has a clear way past.
 * It holds its line against the push of the bends.
 */
export function autopilot(race: Race, { targetSpeed = Infinity, lane = 0 } = {}) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    // One snapshot a step: everything below reads it.
    const snapshot = race.snapshot();
    const me = snapshot.riders[PLAYER];
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    let wanted = Math.min(targetSpeed, bendSpeed(race, me));
    // What it must not steer across, what it can follow until it gets past, and what ahead it may have to slow down for.
    const keepOut: KeepOut[] = [];
    const following: Stretch[] = [];
    const ahead: { readonly offset: number; readonly halfWidth: number; readonly velocity: number; readonly room: number }[] = [];
    for (const thing of thingsOnTheRoad(race, snapshot)) {
      const gap = thing.distance - me.distance;
      const reach = thing.halfLength + 1;
      const closing = me.speed - thing.velocity;
      const alongside = Math.abs(gap) < reach;
      if (!alongside && (gap < 0 || gap - reach > 10 + Math.max(0, closing) * 2)) continue;
      // A little room to spare around what comes at it or stands in its way, a little less beside what it follows and passes.
      const follows = !alongside && thing.velocity > 0;
      const clearance = thing.halfWidth + 0.4 + (follows ? 0.15 : 0.25);
      const stretch: Stretch = [thing.offset - clearance, thing.offset + clearance];
      if (!alongside && thing.velocity >= 0) ahead.push({ ...thing, room: gap - reach });
      if (follows) following.push(stretch);
      else keepOut.push({ stretch, urgency: alongside ? 0 : (gap - reach) / Math.max(1, closing), side: me.offset >= thing.offset ? 1 : -1 });
    }
    const edge = race.track.roadHalfWidth - 0.5;
    const line = clearLine(lane, me.offset, keepOut, following, edge);
    // Something ahead in its path, or in the path of the line it is taking: no faster than lets it brake to that speed in the room there is.
    for (const { offset, halfWidth, velocity, room } of ahead) {
      const inThePath = (at: number) => Math.abs(at - offset) < halfWidth + 0.4 + 0.3;
      if (inThePath(me.offset) || inThePath(line)) wanted = Math.min(wanted, velocity + Math.sqrt(2 * 6 * Math.max(0, room - 1.5)));
    }
    return {
      ...NO_INPUT,
      steer: steerTowards(race, line, sideways, me),
      throttle: me.speed < wanted - 0.5 ? 1 : 0,
      brake: me.speed > wanted + 1 ? Math.min(1, (me.speed - wanted) / 4) : 0,
    };
  };
}

/** The fastest the player (`me`, as the race's snapshot has them now) can ride and still slow down in time for the bends in the next 200 m. */
export function bendSpeed(race: Race, me: Moving = player(race)): number {
  const { distance } = me;
  let fastest = Infinity;
  for (let ahead = 0; ahead <= 200; ahead += 5) {
    const curvature = Math.abs(race.track.sampleAt(distance + ahead).curvature);
    const cornerSpeed = Math.sqrt(16 / Math.max(curvature, 1e-6));
    fastest = Math.min(fastest, Math.sqrt(cornerSpeed ** 2 + 2 * 9 * ahead));
  }
  return fastest;
}

/**
 * Steering that moves the player (`me`, as the race's snapshot has them now)
 * towards `line`, allowing for how hard the bend pushes the bike outwards and
 * how far steering reaches, with the bike moving across the road at
 * `sideways` (m/s) now.
 */
export function steerTowards(race: Race, line: number, sideways: number, me: Moving = player(race)): number {
  const share = me.speed / 62.5;
  const reach = Math.max(1, Math.min(1.6 * me.speed, 8 - 3.5 * share * share));
  const push = -0.3 * me.speed * me.speed * race.track.sampleAt(me.distance).curvature;
  const towards = Math.max(-5, Math.min(5, 2.5 * (line - me.offset)));
  return Math.max(-1, Math.min(1, (towards - push) / reach + 0.1 * (towards - sideways)));
}

/** A stretch of offsets, from left to right. */
type Stretch = [number, number];

/** Offsets to keep out of, around something on the road: how soon it will be reached, and which side of it the rider is. */
interface KeepOut {
  readonly stretch: Stretch;
  /** Seconds until it is reached; 0 when alongside. */
  readonly urgency: number;
  readonly side: Side;
}

/**
 * The other riders' bikes (ridden, or lying where they slid to, to be got back
 * on any moment), the cops' bikes, the cars and the obstacles, as the race's
 * `snapshot` has them: where they are, how fast they go along the track
 * (m/s), and half their size.
 */
function thingsOnTheRoad(race: Race, { riders, cops, traffic }: RaceSnapshot) {
  return [
    ...riders
      .filter((rider) => rider.id !== PLAYER && rider.status === "racing")
      .map(({ bike: { distance, offset, speed } }) => ({ distance, offset, velocity: speed, halfLength: 1, halfWidth: 0.4 })),
    ...cops
      .filter((cop) => cop.status !== "knocked-off")
      .map(({ bike: { distance, offset, speed } }) => ({ distance, offset, velocity: speed, halfLength: 1, halfWidth: 0.4 })),
    ...carsAndObstacles(race.track, traffic),
  ];
}

/**
 * The cars (as a snapshot's `traffic` has them) and the obstacles on `track`,
 * as things a rider can run into: where their middle is, how fast they go
 * along the track (m/s, negative for an oncoming car), half their length and
 * width (metres), and a key that names each.
 */
export function carsAndObstacles(track: Track, traffic: readonly CarSnapshot[]) {
  return [
    ...traffic.map((car) => ({
      key: `car ${car.id}`,
      distance: car.distance,
      offset: car.offset,
      velocity: car.oncoming ? -car.speed : car.speed,
      halfLength: car.length / 2,
      halfWidth: car.width / 2,
    })),
    ...track.obstacles.map(({ distance, offset, radius }, index) => ({
      key: `obstacle ${index}`,
      distance,
      offset,
      velocity: 0,
      halfLength: radius,
      halfWidth: radius,
    })),
  ];
}

/** How far past the edge of a stretch it keeps when it steers out of one (metres). */
const STEER_CLEAR = 0.25;

/**
 * Where a careful rider at `current` steers for, within `edge` of the
 * centreline. If it is in a `keepOut` stretch, out of it on its side of the
 * most urgent thing there, unless that would take it into another, when it
 * holds its line. Otherwise as near `wanted` as it can get without crossing a
 * `keepOut` stretch, and out from behind what it is `following`, on the side
 * it is on, where that leaves it room.
 */
function clearLine(wanted: number, current: number, keepOut: readonly KeepOut[], following: Stretch[], edge: number) {
  const inside = (at: number, [from, to]: Stretch) => at > from && at < to;
  const escaping = keepOut.filter(({ stretch }) => inside(current, stretch));
  if (escaping.length > 0) {
    const { stretch, side } = escaping.reduce((most, next) => (next.urgency < most.urgency ? next : most));
    const way = side > 0 ? stretch[1] + STEER_CLEAR : stretch[0] - STEER_CLEAR;
    const blocked = Math.abs(way) > edge || keepOut.some((other) => inside(way, other.stretch));
    return blocked ? current : way;
  }
  const out = merge(keepOut.map(({ stretch }) => stretch));
  const left = Math.max(-edge, ...out.filter(([, to]) => to <= current).map(([, to]) => to));
  const right = Math.min(edge, ...out.filter(([from]) => from >= current).map(([from]) => from));
  const line = Math.max(left, Math.min(right, wanted));
  const stuck = merge(following).find((stretch) => inside(line, stretch));
  if (!stuck) return line;
  const ways = [stuck[0] - STEER_CLEAR, stuck[1] + STEER_CLEAR].filter((way) => way >= left && way <= right);
  return ways.length === 0 ? line : ways.reduce((best, way) => (Math.abs(way - current) < Math.abs(best - current) ? way : best));
}

/** Stretches joined where they overlap, from left to right. */
function merge(stretches: readonly Stretch[]): Stretch[] {
  const merged: Stretch[] = [];
  for (const [from, to] of [...stretches].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** How far sideways each attack reaches: 1.8 m for punches and kicks, 2.4 m for a club swing. */
const REACH_ACROSS: Record<AttackKind, number> = { punch: 1.8, kick: 1.8, "club-swing": 2.4 };

/** Whether `target` is within reach of an attack of `kind` from `attacker`: at most 2 m along the track, and sideways as far as the attack reaches. */
export function withinReach(attacker: RiderSnapshot, target: RiderSnapshot, kind: AttackKind = "punch") {
  return Math.abs(target.offset - attacker.offset) <= REACH_ACROSS[kind] && Math.abs(target.distance - attacker.distance) <= 2;
}

/** The rider on their bike, still racing, nearest `attacker` and within reach of an attack of `kind` from them; null if none. */
export function nearestWithinReach(
  riders: readonly RiderSnapshot[],
  attacker: RiderSnapshot,
  kind: AttackKind = "punch",
): RiderId | null {
  let nearest: RiderId | null = null;
  let nearestApart = Infinity;
  for (const other of riders) {
    if (other.id === attacker.id || other.status !== "racing" || other.crash !== null || !withinReach(attacker, other, kind)) {
      continue;
    }
    const apart = Math.hypot(other.distance - attacker.distance, other.offset - attacker.offset);
    if (apart < nearestApart) [nearest, nearestApart] = [other.id, apart];
  }
  return nearest;
}

/**
 * Scripted input that rides the player up alongside the opponent `target`,
 * `across` metres to its side (towards the middle of the road) and level with
 * it along the track, and holds the player there. It closes in on the target,
 * and on any rider in its path, at no more than 5 m/s, so running into
 * someone on the way only bumps them.
 */
export function rideAlongside(race: Race, target: RiderId, { across = 1.4 } = {}) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const { riders } = race.snapshot();
    const me = riders[PLAYER];
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    const { lane, closingSpeed } = besides(riders[target], me, across);
    let wanted = Math.max(0, closingSpeed);
    for (const other of riders) {
      const ahead = other.distance - me.distance;
      if (other.id !== PLAYER && ahead > 0 && ahead < 15 && Math.abs(other.offset - me.offset) < 1.2) {
        wanted = Math.min(wanted, other.speed + 5);
      }
    }
    return steerOnto(me, lane, wanted, sideways);
  };
}

/**
 * Where the player rides to be `across` metres to the side of `them`, towards
 * the middle of the road, and level with them: the line, and the speed that
 * closes in on them along the track at no more than 5 m/s.
 */
function besides(them: Moving, me: Moving, across: number) {
  const lane = them.offset + (them.offset > 0 ? -across : across);
  const closing = Math.max(-5, Math.min(5, 0.8 * (them.distance - me.distance)));
  return { lane, closingSpeed: them.speed + closing };
}

/** Input that steers the player, moving across the road at `sideways` m/s, onto `lane`, at about `wanted` m/s. */
export function steerOnto(me: Moving, lane: number, wanted: number, sideways: number): PlayerInput {
  return {
    ...NO_INPUT,
    steer: Math.max(-1, Math.min(1, 0.8 * (lane - me.offset) - 0.25 * sideways)),
    throttle: me.speed < wanted ? 1 : 0,
    brake: me.speed > wanted + 0.5 ? Math.min(1, (me.speed - wanted) / 3) : 0,
  };
}

/** Input that rides at about `speed` straight at `obstacle`, lined up with it. */
export function rideInto(race: Race, obstacle: ObstaclePlacement, speed: number) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const me = player(race);
    const sideways = (me.offset - lastOffset) * STEPS_PER_SECOND;
    lastOffset = me.offset;
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 0.8 * (obstacle.offset - me.offset) - 0.25 * sideways)),
      throttle: me.speed < speed ? 1 : 0,
      brake: me.speed > speed + 1 ? Math.min(1, (me.speed - speed) / 4) : 0,
    };
  };
}

/** Steps with `input` for `seconds` and returns every event emitted on the way. */
export function eventsDuring(race: Race, seconds: number, input: PlayerInput | (() => PlayerInput) = NO_INPUT) {
  const events: RaceEvent[] = [];
  for (let i = 0; i < Math.round(seconds * STEPS_PER_SECOND); i++) {
    race.step(typeof input === "function" ? input() : input);
    events.push(...race.drainEvents());
  }
  return events;
}

/**
 * Steps with `input` until an event that `wanted` picks out is emitted, and
 * returns every event emitted on the way, that one last.
 */
export function eventsUntil(
  race: Race,
  input: PlayerInput | (() => PlayerInput),
  wanted: (event: RaceEvent) => boolean,
  limitSeconds = 60,
) {
  const events: RaceEvent[] = [];
  const done = () => {
    for (const event of race.drainEvents()) events.push(event);
    return events.some(wanted);
  };
  secondsUntil(race, input, done, limitSeconds);
  return events;
}

/** The opponent of a temperament (any, if not given) who lines up nearest the player. */
export function nearestOpponent(race: Race, temperament?: Temperament): RiderId {
  return race
    .snapshot()
    .riders.filter((other) => other.id !== PLAYER && (!temperament || other.temperament === temperament))
    .reduce((nearest, other) => (other.distance < nearest.distance ? other : nearest)).id;
}

/**
 * A started race in which the player has ridden up alongside a racer (an
 * opponent who rarely attacks): the racer is the nearest rider within reach.
 * The race is set up as `setup` says.
 */
export function alongsideARacer(seed = 1, setup: TestSetup = {}) {
  return alongsideAn("racer", seed, setup);
}

/**
 * A started race in which the player has ridden up alongside the opponent of
 * a temperament who lined up nearest them: that opponent is the nearest rider
 * within reach. The race is on a closed road, so that no car comes between
 * them, and set up as `setup` says besides.
 */
export function alongsideAn(temperament: Temperament, seed = 1, setup: TestSetup = {}) {
  const race = startedRace(seed, { ...CLOSED_ROAD, ...setup });
  const target = nearestOpponent(race, temperament);
  const input = rideAlongside(race, target);
  const racerNearest = () => {
    const { riders } = race.snapshot();
    return nearestWithinReach(riders, riders[PLAYER]) === target;
  };
  secondsUntil(race, input, racerNearest, 60);
  race.drainEvents();
  return { race, target, input };
}

/** A started race in which the player, riding alongside a racer, has just punched them off their bike. */
export function racerKnockedOff(seed = 1) {
  const alongside = alongsideARacer(seed);
  const punching = () => ({ ...alongside.input(), punch: true });
  const events = eventsUntil(alongside.race, punching, (event) => event.type === "crash", 10);
  return { ...alongside, events };
}

/**
 * A started race in which the player, riding alongside the bully who lined up
 * nearest them, has punched it just as it began to wind up a swing of its
 * club, so that the punch lands in the middle of the swing. Returns every
 * event from the punch on, over the next half second.
 */
export function punchedMidSwing(seed = 1) {
  const alongside = alongsideAn("bully", seed);
  const { race, target, input } = alongside;
  secondsUntil(race, input, () => swingAt(race, target, "wind-up", 0.5), 30);
  race.drainEvents();
  race.step({ ...input(), punch: true });
  const events = [...race.drainEvents(), ...eventsDuring(race, 0.5, input)];
  return { ...alongside, events };
}

/** Whether the rider `id` is swinging a club, in a stage of the swing and less than `before` (0 to 1) through it. */
export function swingAt(race: Race, id: RiderId, stage: "wind-up" | "recovery", before: number): boolean {
  const attack = race.snapshot().riders[id].attack;
  return attack?.kind === "club-swing" && attack.stage === stage && attack.progress < before;
}

/** Input that rides up behind the opponent `target` at about `closing` m/s faster than it, steering straight at it. */
export function chase(race: Race, target: RiderId, closing: number) {
  return (): PlayerInput => {
    const { riders } = race.snapshot();
    const me = riders[PLAYER];
    const them = riders[target];
    const wanted = them.speed + closing;
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 1.5 * (them.offset - me.offset))),
      throttle: me.speed < wanted ? 1 : 0,
      brake: me.speed > wanted + 1 ? 0.5 : 0,
    };
  };
}

/** Metres between two things in track space: along the track and across it. */
export const apart = (a: TrackPosition, b: TrackPosition) => Math.hypot(a.distance - b.distance, a.offset - b.offset);

/**
 * Scripted input that rides the player up alongside the first cop, 1.4 m to
 * its side (towards the middle of the road) and level with it, and holds them
 * there. It closes in on the cop at no more than 5 m/s, but keeps rolling
 * until it is in its lane: a cop on patrol holds back behind a rider in its
 * way, and a stopped bike can't steer.
 */
function rideAlongsideTheFirstCop(race: Race) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const me = player(race);
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    const { lane, closingSpeed } = besides(race.snapshot().cops[0], me, 1.4);
    return steerOnto(me, lane, Math.max(Math.abs(lane - me.offset) > 0.3 ? 2 : 0, closingSpeed), sideways);
  };
}

/**
 * A started race on a closed road in which the player has passed the first
 * cop, so that it has joined the race, and ridden up alongside it: the cop is
 * within the reach of a punch, and nearer the player than any rider.
 */
export function alongsideTheFirstCop(seed = 1) {
  const race = startedRace(seed, CLOSED_ROAD);
  const waitingAt = race.snapshot().cops[0].distance;
  secondsUntil(race, autopilot(race), () => player(race).distance >= waitingAt, 120);
  const input = rideAlongsideTheFirstCop(race);
  const withinReach = () => {
    const { riders, cops } = race.snapshot();
    const me = riders[PLAYER];
    const cop = cops[0];
    const reached = Math.abs(cop.offset - me.offset) <= 1.8 && Math.abs(cop.distance - me.distance) <= 2;
    const riding = riders.filter((rider) => rider.id !== PLAYER && rider.status === "racing" && !rider.crash);
    const nearer = riding.some((rider) => apart(rider, me) <= apart(cop, me));
    return reached && !nearer;
  };
  secondsUntil(race, input, withinReach, 30);
  race.drainEvents();
  return { race, input };
}

/**
 * A started race on a closed road in which the player has ridden to within
 * `before` metres of the first cop, waiting on the shoulder.
 */
export function nearingTheWaitingCop(before: number, seed = 1) {
  const race = startedRace(seed, CLOSED_ROAD);
  const waitingAt = race.snapshot().cops[0].distance;
  secondsUntil(race, autopilot(race), () => player(race).distance >= waitingAt - before, 120);
  race.drainEvents();
  return { race, cop: () => race.snapshot().cops[0] };
}
