/**
 * Small numeric helpers for the renderer, the sound and the UI. The Race
 * module keeps its own, since it imports nothing from the rest of the game.
 */

/** `value`, kept between `min` and `max`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 0 up to `from`, 1 from `to`, and an S-curve between them, slow at both ends. */
export function smoothstep(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

/** An angle in `degrees`, in radians. */
export function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
