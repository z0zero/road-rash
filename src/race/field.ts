import type { Random } from "./random";
import type { Track } from "./track";

/** Where a rider lines up for the start, in track space. */
export interface StartSlot {
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres right of the centreline. */
  readonly offset: number;
}

/** The nearest group of opponents lines up about this many metres ahead of the player... */
const NEAREST_GROUP = 30;
/** ...and the furthest at most this many. */
const FURTHEST_GROUP = 400;
/** Riders in a group line up side by side, up to this many metres apart along the track. */
const GROUP_STAGGER = 3;
/** Side-by-side places across the two lanes that run in the race direction, as fractions of their width. */
const ACROSS: Record<number, readonly number[]> = { 2: [0.25, 0.75], 3: [1 / 6, 1 / 2, 5 / 6] };

/**
 * Lines up `count` opponents ahead of the player's place on the start line, as
 * in the original: strung out over the first 400 m in small groups of two or
 * three, riding side by side in the lanes that run in the race direction. The
 * order is drawn from `random`; slot `i` is for the i-th opponent.
 */
export function lineUpOpponents(track: Track, count: number, random: Random): StartSlot[] {
  const sizes = groupSizes(count, random);
  const spacing = (FURTHEST_GROUP - NEAREST_GROUP) / Math.max(1, sizes.length - 1);
  const slots: StartSlot[] = [];
  sizes.forEach((size, group) => {
    // Group 0 is the furthest ahead; jitter never takes it beyond FURTHEST_GROUP.
    const jitter = group === 0 ? random.between(0, 0.2) : random.between(-0.2, 0.2);
    const ahead = FURTHEST_GROUP - spacing * (group + jitter);
    for (const across of ACROSS[size]) {
      slots.push({
        distance: track.startDistance + Math.max(NEAREST_GROUP, ahead) - random.between(0, GROUP_STAGGER),
        offset: across * 2 * track.laneWidth,
      });
    }
  });
  return shuffle(slots, random);
}

/** Splits `count` riders into groups of two or three, front to back. */
function groupSizes(count: number, random: Random): number[] {
  const sizes: number[] = [];
  let left = count;
  while (left > 0) {
    let size = left <= 3 ? left : random.chance(0.5) ? 2 : 3;
    // Never leave a rider on their own.
    if (left - size === 1) size = size === 3 ? 2 : 3;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

/** A new array with the items in an order drawn from `random` (Fisher-Yates). */
function shuffle<T>(items: readonly T[], random: Random): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
