/**
 * Directions on the ground, from compass headings as the track measures them
 * (`TrackSample.heading`, `Track.seaHeading`): 0 is north (-z) and headings
 * grow turning right, so a quarter turn is east (+x).
 */
import type { Side } from "@/race";

/** The unit vector on the ground pointing along a compass heading. */
export function groundDirection(heading: number): { x: number; z: number } {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

/**
 * How squarely one side of a road heading `heading` faces the sea out at
 * `seaHeading`: 1 when the sea lies straight out on that side, -1 when it lies
 * straight out on the other, 0 when the road heads straight out to sea or
 * inland.
 */
export function seaward(heading: number, side: Side, seaHeading: number): number {
  return Math.cos(heading + (side * Math.PI) / 2 - seaHeading);
}
