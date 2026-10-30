import { crash, knockDown, type Body, type Crash } from "./crashing";
import type { Fighter } from "./fighting";
import type { Footprint } from "./footprint";
import { copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import type { Rider } from "./riders";
import { BIKE_LENGTH, BIKE_WIDTH, clamp, type Motion } from "./riding";
import { STEP_SECONDS } from "./steps";
import { TUNING } from "./tuning";

/** A bike reaches this many metres ahead of and behind its middle... */
const BIKE_HALF_LENGTH = BIKE_LENGTH / 2;
/** ...and this many to either side of it. */
const BIKE_HALF_WIDTH = BIKE_WIDTH / 2;
/** A rider on foot takes up about this many metres, along the track and across it. */
const BODY_SIZE = 0.6;
/** A rider who runs into a car or an obstacle is thrown sideways off it at least this fast (m/s), so they land beside it, not on it. */
const THROWN_SIDEWAYS = 3;
/** A car knocks a rider on foot down only by driving into them: closing in on them along its own way faster than this (m/s). */
const DRIVING_INTO = 1;

/** A rider who ran into another bike too fast to bump it: they crash. */
interface RunIn<T> {
  /** The faster of the two. */
  readonly rider: T;
  /** The bike they ran into. */
  readonly into: T;
  /** How much faster they were going than the bike they hit (m/s). */
  readonly speedDifference: number;
}

/**
 * Settles contact between every pair of bikes being ridden (`bikes`, riders'
 * and cops') that overlap. At a speed difference under
 * `TUNING.bumpSpeedLimit` they bump apart: they are separated the shorter way
 * (sideways when side by side, along the track when nose to tail), shoved
 * sideways away from each other, and a faster bike behind can't push through
 * the one in front, so the two share their speed. Offsets stay within `edge`.
 * At a bigger speed difference the faster one runs into the other: it is
 * returned, to crash, and takes no further part in this contact; unless it
 * `canCrash` not, when the two only bump. Pairs are taken in a fixed order, so
 * the outcome is deterministic.
 */
function settleContact<T extends { readonly motion: Motion }>(
  bikes: readonly T[],
  edge: number,
  canCrash: (bike: T) => boolean = () => true,
): RunIn<T>[] {
  const runIns: RunIn<T>[] = [];
  const ranIn = new Set<T>();
  for (let i = 0; i < bikes.length; i++) {
    for (let j = i + 1; j < bikes.length; j++) {
      const [a, b] = [bikes[i], bikes[j]];
      if (ranIn.has(a) || ranIn.has(b) || !overlapping(a.motion, b.motion)) continue;
      const speedDifference = Math.abs(a.motion.speed - b.motion.speed);
      const [faster, slower] = a.motion.speed > b.motion.speed ? [a, b] : [b, a];
      if (speedDifference < TUNING.bumpSpeedLimit || !canCrash(faster)) {
        bump(a.motion, b.motion, edge);
      } else {
        ranIn.add(faster);
        runIns.push({ rider: faster, into: slower, speedDifference });
      }
    }
  }
  return runIns;
}

/** A rider who ran into a car or an obstacle too fast to bump off it: they crash. */
interface Impact<T> {
  readonly rider: T;
  /** What they ran into. */
  readonly footprint: Footprint;
  /** How fast they met it (m/s): for an oncoming car, the two speeds added together. */
  readonly speedDifference: number;
}

/**
 * Settles contact between bikes being ridden and cars or obstacles (their
 * `footprints`), which carry on as if nothing happened. At a speed difference
 * under `TUNING.bumpSpeedLimit` the bike bumps off it: it is pushed clear of
 * it the shorter way (sideways when side by side, along the track when nose
 * to tail) and shoved sideways away from it; a bike behind it can't push
 * through it, and one a car catches from behind is carried along by it. At a
 * bigger speed difference its rider runs into it: they are returned, with
 * what they ran into, to crash; unless they `canCrash` not, when they only
 * bump. Offsets stay within `edge`.
 */
function settleImpacts<T extends { readonly motion: Motion }>(
  riders: readonly T[],
  footprints: readonly Footprint[],
  edge: number,
  canCrash: (rider: T) => boolean = () => true,
): Impact<T>[] {
  const impacts: Impact<T>[] = [];
  for (const rider of riders) {
    for (const footprint of footprints) {
      const contact = contactWith(rider.motion, footprint);
      if (!contact) continue;
      const speedDifference = Math.abs(rider.motion.speed - footprint.velocity);
      if (speedDifference >= TUNING.bumpSpeedLimit && canCrash(rider)) {
        impacts.push({ rider, footprint, speedDifference });
        break;
      }
      bumpOff(rider.motion, footprint, contact, edge);
    }
  }
  return impacts;
}

/** How a bike overlaps a footprint, or null if it doesn't. */
interface Contact {
  /** Metres from the bike to the footprint along the track, and across it. */
  readonly along: number;
  readonly across: number;
  /** Metres they overlap by along the track, and across it. */
  readonly overlapAlong: number;
  readonly overlapAcross: number;
}

function contactWith(bike: Motion, footprint: Footprint): Contact | null {
  const along = footprint.distance - bike.distance;
  const across = footprint.offset - bike.offset;
  const overlapAlong = footprint.halfLength + BIKE_HALF_LENGTH - Math.abs(along);
  const overlapAcross = footprint.halfWidth + BIKE_HALF_WIDTH - Math.abs(across);
  return overlapAlong > 0 && overlapAcross > 0 ? { along, across, overlapAlong, overlapAcross } : null;
}

function bumpOff(bike: Motion, footprint: Footprint, { along, across, overlapAlong, overlapAcross }: Contact, edge: number) {
  // Which way the bike is pushed: away from what it touched, to the right when dead behind it; but the other way if a
  // bike has no room to pass it on that side, between it and the edge.
  const away = across !== 0 ? -Math.sign(across) : 1;
  const room = (side: number) => edge - side * footprint.offset - footprint.halfWidth >= BIKE_WIDTH;
  const side = room(away) || !room(-away) ? away : -away;
  if (overlapAcross <= overlapAlong) {
    bike.offset = clamp(footprint.offset + side * (footprint.halfWidth + BIKE_HALF_WIDTH), -edge, edge);
  } else if (along > 0) {
    bike.distance -= overlapAlong;
    bike.speed = Math.max(0, Math.min(bike.speed, footprint.velocity));
  } else {
    bike.distance += overlapAlong;
    bike.speed = Math.max(bike.speed, footprint.velocity);
  }
  bike.shove = side > 0 ? Math.max(bike.shove, TUNING.bumpShove) : Math.min(bike.shove, -TUNING.bumpShove);
}

/**
 * After a rider has run into a car or an obstacle (its `footprint`, a car's
 * if `isACar`): their bike stops against it, clear of it on the side it came
 * from, going no faster than it; and the rider is thrown clear of it,
 * sideways away from it, and on along the road, at least as fast as a car
 * that caught them from behind. A rider who runs into the back of a car going
 * their way, or standing still, lands behind it, going no faster than it, so
 * it drives on away from them, or they stay clear of it.
 */
function throwClearOf(footprint: Footprint, isACar: boolean, bike: Motion, body: Body, edge: number) {
  const along = footprint.distance - bike.distance;
  const { velocity } = footprint;
  bike.distance = footprint.distance - Math.sign(along || 1) * (footprint.halfLength + BIKE_HALF_LENGTH + 0.05);
  bike.speed = Math.max(0, along > 0 ? Math.min(bike.speed, velocity) : velocity);
  bike.steering = 0;
  bike.shove = 0;
  bike.kickShove = 0;
  bike.offset = clamp(bike.offset, -edge, edge);
  const away = Math.sign(body.offset - footprint.offset) || 1;
  body.sideways = away * Math.max(Math.abs(body.sideways), THROWN_SIDEWAYS);
  if (along > 0 && (velocity > 0 || (isACar && velocity === 0))) {
    body.distance = Math.min(body.distance, footprint.distance - footprint.halfLength - BODY_SIZE / 2 - 0.05);
    body.speed = Math.min(body.speed, velocity);
  } else {
    body.speed = Math.max(body.speed, velocity);
  }
}

/** Whether a car (by its footprint) and a rider on foot at `body` touch. */
function touching(car: Footprint, body: Readonly<Body>): boolean {
  return (
    Math.abs(car.distance - body.distance) < car.halfLength + BODY_SIZE / 2 &&
    Math.abs(car.offset - body.offset) < car.halfWidth + BODY_SIZE / 2
  );
}

/**
 * How fast (m/s) a car (by its footprint) drives into a rider on foot at
 * `body`: its own speed, less however fast they get away from it its way. A
 * car standing still drives into nobody, and nor does one going slower than
 * them that they run into.
 */
function drivingInto(car: Footprint, body: Readonly<Body>): number {
  return Math.abs(car.velocity) - Math.max(0, Math.sign(car.velocity) * body.speed);
}

/**
 * Pushes a rider on foot at `body` clear of a car (by its footprint) that
 * isn't driving into them: out the shorter way, off its side, or off its end,
 * where they step round it at a run, to the side of it they are on, or to the
 * other if there is no room on theirs before `edge`.
 */
function pushClearOf(car: Footprint, body: Body, edge: number) {
  const along = body.distance - car.distance;
  const across = body.offset - car.offset;
  const [reachAlong, reachAcross] = [car.halfLength + BODY_SIZE / 2, car.halfWidth + BODY_SIZE / 2];
  const away = Math.sign(across) || 1;
  const room = (side: number) => edge - side * car.offset - reachAcross >= BODY_SIZE / 2;
  const side = room(away) || !room(-away) ? away : -away;
  if (reachAcross - Math.abs(across) <= reachAlong - Math.abs(along)) {
    body.offset = clamp(car.offset + side * reachAcross, -edge, edge);
  } else {
    body.distance = car.distance + (Math.sign(along) || 1) * reachAlong;
    body.offset = clamp(body.offset + side * TUNING.runSpeed * STEP_SECONDS, -edge, edge);
  }
}

/**
 * A car (by its footprint) knocks down the rider on foot whose crash is
 * `crash`: they tumble again, thrown along the road with it and sideways off
 * it. Returns how fast it hit them (m/s).
 */
function knockDownBy(car: Footprint, crash: Crash): number {
  const impactSpeed = Math.abs(car.velocity - crash.body.speed);
  const away = Math.sign(crash.body.offset - car.offset) || 1;
  knockDown(crash, car.velocity, away * THROWN_SIDEWAYS);
  return impactSpeed;
}

function overlapping(a: Motion, b: Motion) {
  return Math.abs(b.distance - a.distance) < BIKE_LENGTH && Math.abs(b.offset - a.offset) < BIKE_WIDTH;
}

function bump(a: Motion, b: Motion, edge: number) {
  const along = b.distance - a.distance;
  const across = b.offset - a.offset;
  const overlapAlong = BIKE_LENGTH - Math.abs(along);
  const overlapAcross = BIKE_WIDTH - Math.abs(across);

  // Which way b lies from a: 1 for right. Nose to tail, the rider in front gives way to the right.
  const side = across !== 0 ? Math.sign(across) : along >= 0 ? 1 : -1;
  if (overlapAcross <= overlapAlong) {
    a.offset = clamp(a.offset - (side * overlapAcross) / 2, -edge, edge);
    b.offset = clamp(b.offset + (side * overlapAcross) / 2, -edge, edge);
  } else {
    const [behind, ahead] = along >= 0 ? [a, b] : [b, a];
    behind.distance -= overlapAlong / 2;
    ahead.distance += overlapAlong / 2;
  }
  a.shove = side > 0 ? Math.min(a.shove, -TUNING.bumpShove) : Math.max(a.shove, TUNING.bumpShove);
  b.shove = side > 0 ? Math.max(b.shove, TUNING.bumpShove) : Math.min(b.shove, -TUNING.bumpShove);

  const [behind, ahead] = along >= 0 ? [a, b] : [b, a];
  if (behind.speed > ahead.speed) {
    const shared = (behind.speed + ahead.speed) / 2;
    behind.speed = shared;
    ahead.speed = shared;
  }
}

/**
 * Riders on their bikes (`riding`) bump each other and the cops' bikes, or
 * run into them and crash; a cop never crashes.
 */
export function runIntoEachOther(race: RaceState, riding: readonly Rider[]) {
  const bikes: Fighter[] = [...riding, ...race.cops.filter((cop) => cop.status !== "knocked-off")];
  for (const { rider, into, speedDifference } of settleContact(bikes, race.edge, (bike) => bike.kind === "rider")) {
    if (rider.kind === "rider") crash(race, rider, into.kind === "cop" ? "cop" : "rider", speedDifference);
  }
}

/**
 * Riders on their bikes who run into the `cars` (by their footprints) or
 * obstacles crash, or bump off them at a small speed difference. Cops in the
 * race only ever bump off cars and obstacles.
 */
export function runIntoCarsAndObstacles(race: RaceState, cars: readonly Footprint[]) {
  const { edge } = race;
  for (const [footprints, cause] of [
    [cars, "traffic"],
    [race.obstacles, "obstacle"],
  ] as const) {
    for (const { rider, footprint, speedDifference } of settleImpacts(onTheirBikes(race), footprints, edge)) {
      crash(race, rider, cause, speedDifference);
      if (rider.crash) throwClearOf(footprint, cause === "traffic", rider.motion, rider.crash.body, edge);
    }
    settleImpacts(copsInTheRace(race), footprints, edge, () => false);
  }
}

/**
 * A car (one of `cars`, by their footprints) that drives into a rider on foot
 * knocks them down: one closing in on them along its own way at over
 * `DRIVING_INTO`. A car standing still, or going slower than them, that they
 * run into only pushes them clear of it, and they go round it.
 */
export function knockDownRidersOnFoot(race: RaceState, cars: readonly Footprint[]) {
  for (const rider of race.riders) {
    if (rider.status !== "racing" || rider.crash?.phase !== "on-foot") continue;
    const { crash } = rider;
    for (const car of cars) {
      if (!touching(car, crash.body)) continue;
      if (drivingInto(car, crash.body) > DRIVING_INTO) {
        race.events.push({ type: "knocked-down", rider: rider.id, impactSpeed: knockDownBy(car, crash) });
        break;
      }
      pushClearOf(car, crash.body, race.edge);
    }
  }
}
