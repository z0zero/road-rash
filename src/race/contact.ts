import { clamp, type Motion } from "./riding";
import { TUNING } from "./tuning";

/** A rider on a bike takes up about this many metres along the track... */
const RIDER_LENGTH = 2;
/** ...and this many across it. */
const RIDER_WIDTH = 0.8;

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
