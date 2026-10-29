/**
 * Repeatable randomness for building the world: the same numbers every time,
 * so the coast, its scenery and its models look the same in every race.
 */

/** A pseudo-random number in [0, 1) for an integer. */
export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] along one dimension; `seed` picks an unrelated curve. */
export function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i * 7919 + seed * 104729);
  const b = hash((i + 1) * 7919 + seed * 104729);
  return a + (b - a) * u;
}
