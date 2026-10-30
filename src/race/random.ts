/** A seeded pseudo-random generator: the Race module's only source of randomness. */
export interface Random {
  /** A number in [0, 1). */
  next(): number;
  /** A number in [min, max). */
  between(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** -1 or 1 with equal probability. */
  sign(): -1 | 1;
}

/** sfc32, seeded through splitmix32 so that nearby seeds give unrelated sequences. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const splitmix = () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();

  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();

  return {
    next,
    between: (min, max) => min + (max - min) * next(),
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}
