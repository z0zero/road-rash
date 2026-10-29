import { clamp, type Motion } from "./riding";
import { TUNING } from "./tuning";

/** A rider on a bike takes up about this many metres along the track... */
const RIDER_LENGTH = 2;
/** ...and this many across it. */
const RIDER_WIDTH = 0.8;

/**
 * Bumps apart every pair of riders on their bikes who overlap at a speed
 * difference under `TUNING.bumpSpeedLimit`: they are separated the shorter way
 * (sideways when side by side, along the track when nose to tail), shoved
 * sideways away from each other, and a faster rider behind can't push through
 * the one in front, so the two share their speed. Offsets stay within `edge`.
 * Pairs are taken in a fixed order, so the outcome is deterministic.
 */
export function bumpApart(motions: readonly Motion[], edge: number): void {
  for (let i = 0; i < motions.length; i++) {
    for (let j = i + 1; j < motions.length; j++) {
      bump(motions[i], motions[j], edge);
    }
  }
}

function bump(a: Motion, b: Motion, edge: number) {
  const along = b.distance - a.distance;
  const across = b.offset - a.offset;
  const overlapAlong = RIDER_LENGTH - Math.abs(along);
  const overlapAcross = RIDER_WIDTH - Math.abs(across);
  if (overlapAlong <= 0 || overlapAcross <= 0) return;
  if (Math.abs(a.speed - b.speed) >= TUNING.bumpSpeedLimit) return;

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
