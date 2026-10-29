import type { Body } from "./crashing";
import { clamp, type Motion } from "./riding";
import { velocityOf, type Car } from "./traffic";
import { TUNING } from "./tuning";

/** A rider on a bike takes up about this many metres along the track... */
const RIDER_LENGTH = 2;
/** ...and this many across it. */
const RIDER_WIDTH = 0.8;
/** A rider who runs into a car is thrown sideways off it at least this fast (m/s), so they land beside it, not under it. */
const THROWN_SIDEWAYS = 3;

/** A rider who ran into another rider too fast to bump them: they crash. */
export interface RunIn<T> {
  /** The faster of the two. */
  readonly rider: T;
  /** How much faster they were going than the rider they hit (m/s). */
  readonly speedDifference: number;
}

/**
 * Settles contact between every pair of riders on their bikes who overlap.
 * At a speed difference under `TUNING.bumpSpeedLimit` they bump apart: they
 * are separated the shorter way (sideways when side by side, along the track
 * when nose to tail), shoved sideways away from each other, and a faster rider
 * behind can't push through the one in front, so the two share their speed.
 * Offsets stay within `edge`. At a bigger speed difference the faster rider
 * runs into the other: they are returned, to crash, and take no further part
 * in this contact. Pairs are taken in a fixed order, so the outcome is
 * deterministic.
 */
export function settleContact<T extends { readonly motion: Motion }>(riders: readonly T[], edge: number): RunIn<T>[] {
  const runIns: RunIn<T>[] = [];
  const ranIn = new Set<T>();
  for (let i = 0; i < riders.length; i++) {
    for (let j = i + 1; j < riders.length; j++) {
      const [a, b] = [riders[i], riders[j]];
      if (ranIn.has(a) || ranIn.has(b) || !overlapping(a.motion, b.motion)) continue;
      const speedDifference = Math.abs(a.motion.speed - b.motion.speed);
      if (speedDifference < TUNING.bumpSpeedLimit) {
        bump(a.motion, b.motion, edge);
      } else {
        const faster = a.motion.speed > b.motion.speed ? a : b;
        ranIn.add(faster);
        runIns.push({ rider: faster, speedDifference });
      }
    }
  }
  return runIns;
}

/** A rider who ran into a car too fast to bump off it: they crash. */
export interface CarRunIn<T> {
  readonly rider: T;
  readonly car: Car;
  /** How much faster than the car the rider was going, or how fast they met, for an oncoming car (m/s). */
  readonly speedDifference: number;
}

/**
 * Settles contact between riders on their bikes and cars, which drive on as
 * if nothing happened. At a speed difference under `TUNING.bumpSpeedLimit`
 * the rider bumps off the car: they are pushed clear of it the shorter way
 * (sideways when side by side, along the track when nose to tail) and
 * shoved sideways away from it; a rider behind it can't push through it, and
 * one it catches from behind is carried along by it. At a bigger speed
 * difference the rider runs into the car: they are returned, with the car,
 * to crash. Offsets stay within `edge`.
 */
export function settleTraffic<T extends { readonly motion: Motion }>(
  riders: readonly T[],
  cars: readonly Car[],
  edge: number,
): CarRunIn<T>[] {
  const runIns: CarRunIn<T>[] = [];
  for (const rider of riders) {
    for (const car of cars) {
      const contact = contactWith(rider.motion, car);
      if (!contact) continue;
      const speedDifference = Math.abs(rider.motion.speed - velocityOf(car));
      if (speedDifference >= TUNING.bumpSpeedLimit) {
        runIns.push({ rider, car, speedDifference });
        break;
      }
      bumpOff(rider.motion, car, contact, edge);
    }
  }
  return runIns;
}

/** How a bike overlaps a car, or null if it doesn't. */
interface Contact {
  /** Metres from the bike to the car along the track, and across it. */
  readonly along: number;
  readonly across: number;
  /** Metres they overlap by along the track, and across it. */
  readonly overlapAlong: number;
  readonly overlapAcross: number;
}

function contactWith(bike: Motion, car: Car): Contact | null {
  const along = car.distance - bike.distance;
  const across = car.offset - bike.offset;
  const overlapAlong = (car.length + RIDER_LENGTH) / 2 - Math.abs(along);
  const overlapAcross = (car.width + RIDER_WIDTH) / 2 - Math.abs(across);
  return overlapAlong > 0 && overlapAcross > 0 ? { along, across, overlapAlong, overlapAcross } : null;
}

function bumpOff(bike: Motion, car: Car, { along, across, overlapAlong, overlapAcross }: Contact, edge: number) {
  // Which way the bike is pushed: away from the car, to the right when dead behind it.
  const side = across !== 0 ? -Math.sign(across) : 1;
  const velocity = velocityOf(car);
  if (overlapAcross <= overlapAlong) {
    bike.offset = clamp(bike.offset + side * overlapAcross, -edge, edge);
  } else if (along > 0) {
    bike.distance -= overlapAlong;
    bike.speed = Math.max(0, Math.min(bike.speed, velocity));
  } else {
    bike.distance += overlapAlong;
    bike.speed = Math.max(bike.speed, velocity);
  }
  bike.shove = side > 0 ? Math.max(bike.shove, TUNING.bumpShove) : Math.min(bike.shove, -TUNING.bumpShove);
}

/**
 * After a rider has run into a car: their bike stops against it, clear of
 * it on the side it came from, going no faster than the car; and the rider
 * is thrown clear of it, sideways away from it, and along the road at least
 * as fast as the car if it caught them from behind.
 */
export function throwClearOf(car: Car, bike: Motion, body: Body, edge: number) {
  const along = car.distance - bike.distance;
  const velocity = velocityOf(car);
  bike.distance = car.distance - Math.sign(along || 1) * ((car.length + RIDER_LENGTH) / 2 + 0.05);
  bike.speed = Math.max(0, along > 0 ? Math.min(bike.speed, velocity) : velocity);
  bike.steering = 0;
  bike.shove = 0;
  bike.offset = clamp(bike.offset, -edge, edge);
  const away = Math.sign(body.offset - car.offset) || 1;
  body.sideways = away * Math.max(Math.abs(body.sideways), THROWN_SIDEWAYS);
  body.speed = Math.max(body.speed, velocity);
}

function overlapping(a: Motion, b: Motion) {
  return Math.abs(b.distance - a.distance) < RIDER_LENGTH && Math.abs(b.offset - a.offset) < RIDER_WIDTH;
}

function bump(a: Motion, b: Motion, edge: number) {
  const along = b.distance - a.distance;
  const across = b.offset - a.offset;
  const overlapAlong = RIDER_LENGTH - Math.abs(along);
  const overlapAcross = RIDER_WIDTH - Math.abs(across);

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
