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
  type AttackKind,
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
 * and, like any careful rider, keeping clear of the riders ahead: it steers
 * around one in its way, and never closes on one still in its way faster
 * than a bump.
 */
export function autopilot(race: Race, { targetSpeed = Infinity, lane = 0 } = {}) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const { riders } = race.snapshot();
    const rider = riders[PLAYER];
    const sideways = (rider.offset - lastOffset) / STEP_SECONDS;
    lastOffset = rider.offset;
    let wanted = targetSpeed;
    for (let ahead = 0; ahead <= 200; ahead += 5) {
      const curvature = Math.abs(race.track.sampleAt(rider.distance + ahead).curvature);
      const cornerSpeed = Math.sqrt(16 / Math.max(curvature, 1e-6));
      wanted = Math.min(wanted, Math.sqrt(cornerSpeed ** 2 + 2 * 9 * ahead));
    }
    let line = lane;
    for (const other of riders) {
      const ahead = other.distance - rider.distance;
      if (other.id === PLAYER || other.status !== "racing" || other.crash !== null || ahead <= 0 || ahead > 30) continue;
      if (Math.abs(other.offset - line) < 1.6) line = other.offset + (line >= other.offset ? 1.6 : -1.6);
      if (Math.abs(other.offset - rider.offset) < 1.2 && ahead < 12) wanted = Math.min(wanted, other.speed + 5);
    }
    const edge = race.track.roadHalfWidth - 0.5;
    line = Math.max(-edge, Math.min(edge, line));
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 0.5 * (line - rider.offset) - 0.25 * sideways)),
      throttle: rider.speed < wanted - 0.5 ? 1 : 0,
      brake: rider.speed > wanted + 1 ? Math.min(1, (rider.speed - wanted) / 4) : 0,
    };
  };
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
 * The race is set up with `options` besides the seed.
 */
export function alongsideARacer(seed = 1, options: Omit<RaceOptions, "seed"> = {}) {
  return alongsideAn("racer", seed, options);
}

/**
 * A started race in which the player has ridden up alongside the opponent of
 * a temperament who lined up nearest them: that opponent is the nearest rider
 * within reach. The race is set up with `options` besides the seed.
 */
export function alongsideAn(temperament: Temperament, seed = 1, options: Omit<RaceOptions, "seed"> = {}) {
  const race = startedRace(seed, options);
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
  const swingBeginning = () => {
    const attack = race.snapshot().riders[target].attack;
    return attack?.kind === "club-swing" && attack.stage === "wind-up" && attack.progress < 0.5;
  };
  secondsUntil(race, input, swingBeginning, 30);
  race.drainEvents();
  race.step({ ...input(), punch: true });
  const events = [...race.drainEvents(), ...eventsDuring(race, 0.5, input)];
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
