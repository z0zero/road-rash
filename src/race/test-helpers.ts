/**
 * Scripted riding for the Race module's tests. Everything here drives a race
 * through its interface and reads only what any caller can: snapshots and the
 * track.
 */
import {
  createRace,
  NO_INPUT,
  PLAYER,
  STEP_SECONDS,
  type CarSnapshot,
  type PlayerInput,
  type Race,
  type RaceEvent,
  type RaceOptions,
  type RiderId,
  type RiderSnapshot,
  type Temperament,
} from ".";

export const STEPS_PER_SECOND = 60;
export const FULL_THROTTLE: PlayerInput = { ...NO_INPUT, throttle: 1 };

/** km/h in metres per second. */
export function kmh(value: number) {
  return value / 3.6;
}

export function stepFor(race: Race, seconds: number, input: PlayerInput = NO_INPUT) {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let i = 0; i < steps; i++) race.step(input);
}

/** A race whose countdown has just run out, set up with `options` besides the seed. */
export function startedRace(seed = 1, options: Omit<RaceOptions, "seed"> = {}) {
  const race = createRace({ ...options, seed });
  stepFor(race, 3);
  race.drainEvents();
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
 * and, like any careful rider, keeping clear of the riders, cars and
 * obstacles on the road: it never steers across anything it is about to
 * reach or is alongside, gets out of the way of what comes at it, and
 * follows a slower rider or car in its path until it has a clear way past.
 * It holds its line against the push of the bends.
 */
export function autopilot(race: Race, { targetSpeed = Infinity, lane = 0 } = {}) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const { riders, traffic } = race.snapshot();
    const me = riders[PLAYER];
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    let wanted = Math.min(targetSpeed, bendSpeed(race));
    // What it must not steer across, what it can follow until it gets past, and what ahead it may have to slow down for.
    const keepOut: KeepOut[] = [];
    const following: Stretch[] = [];
    const ahead: { readonly offset: number; readonly halfWidth: number; readonly velocity: number; readonly room: number }[] = [];
    for (const thing of thingsOnTheRoad(race, riders, traffic)) {
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
      steer: steerTowards(race, line, sideways),
      throttle: me.speed < wanted - 0.5 ? 1 : 0,
      brake: me.speed > wanted + 1 ? Math.min(1, (me.speed - wanted) / 4) : 0,
    };
  };
}

/** The fastest the player can ride now and still slow down in time for the bends in the next 200 m. */
export function bendSpeed(race: Race): number {
  const { distance } = player(race);
  let fastest = Infinity;
  for (let ahead = 0; ahead <= 200; ahead += 5) {
    const curvature = Math.abs(race.track.sampleAt(distance + ahead).curvature);
    const cornerSpeed = Math.sqrt(16 / Math.max(curvature, 1e-6));
    fastest = Math.min(fastest, Math.sqrt(cornerSpeed ** 2 + 2 * 9 * ahead));
  }
  return fastest;
}

/**
 * Steering that moves the player towards `line`, allowing for how hard the
 * bend pushes the bike outwards and how far steering reaches, with the bike
 * moving across the road at `sideways` (m/s) now.
 */
export function steerTowards(race: Race, line: number, sideways: number): number {
  const me = player(race);
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
  readonly side: -1 | 1;
}

/**
 * The other riders' bikes (ridden, or lying where they slid to, to be got back
 * on any moment), the cars and the obstacles: where they are, how fast they
 * go along the track (m/s), and half their size.
 */
function thingsOnTheRoad(race: Race, riders: readonly RiderSnapshot[], traffic: readonly CarSnapshot[]) {
  return [
    ...riders
      .filter((rider) => rider.id !== PLAYER && rider.status === "racing")
      .map(({ bike: { distance, offset, speed } }) => ({ distance, offset, velocity: speed, halfLength: 1, halfWidth: 0.4 })),
    ...traffic.map((car) => ({
      distance: car.distance,
      offset: car.offset,
      velocity: car.oncoming ? -car.speed : car.speed,
      halfLength: car.length / 2,
      halfWidth: car.width / 2,
    })),
    ...race.track.obstacles.map(({ distance, offset, radius }) => ({
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

/** Whether `target` is within reach of `attacker`'s punches and kicks: at most 1.8 m sideways and 2 m along the track. */
export function withinReach(attacker: RiderSnapshot, target: RiderSnapshot) {
  return Math.abs(target.offset - attacker.offset) <= 1.8 && Math.abs(target.distance - attacker.distance) <= 2;
}

/** The rider on their bike, still racing, nearest `attacker` and within reach of their punches and kicks; null if none. */
export function nearestWithinReach(riders: readonly RiderSnapshot[], attacker: RiderSnapshot): RiderId | null {
  let nearest: RiderId | null = null;
  let nearestApart = Infinity;
  for (const other of riders) {
    if (other.id === attacker.id || other.status !== "racing" || other.crash !== null || !withinReach(attacker, other)) continue;
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
    const them = riders[target];
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    const lane = them.offset + (them.offset > 0 ? -across : across);
    const closing = Math.max(-5, Math.min(5, 0.8 * (them.distance - me.distance)));
    let wanted = Math.max(0, them.speed + closing);
    for (const other of riders) {
      const ahead = other.distance - me.distance;
      if (other.id !== PLAYER && ahead > 0 && ahead < 15 && Math.abs(other.offset - me.offset) < 1.2) {
        wanted = Math.min(wanted, other.speed + 5);
      }
    }
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 0.8 * (lane - me.offset) - 0.25 * sideways)),
      throttle: me.speed < wanted ? 1 : 0,
      brake: me.speed > wanted + 0.5 ? Math.min(1, (me.speed - wanted) / 3) : 0,
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
 */
export function alongsideARacer(seed = 1) {
  return alongsideAn("racer", seed);
}

/**
 * A started race in which the player has ridden up alongside the opponent of
 * a temperament who lined up nearest them: that opponent is the nearest rider
 * within reach.
 */
export function alongsideAn(temperament: Temperament, seed = 1) {
  const race = startedRace(seed);
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
