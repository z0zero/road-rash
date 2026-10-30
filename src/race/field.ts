import { wholePatience } from "./opponent-fighting";
import { paceFor } from "./opponent-riding";
import { OPPONENTS, PLAYER_NAME } from "./opponents";
import type { Random } from "./random";
import { PLAYER, type Rider } from "./riders";
import type { Track, TrackPosition } from "./track";
import { TUNING } from "./tuning";

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
export function lineUpOpponents(track: Track, count: number, random: Random): TrackPosition[] {
  const sizes = groupSizes(count, random);
  const spacing = (FURTHEST_GROUP - NEAREST_GROUP) / Math.max(1, sizes.length - 1);
  const slots: TrackPosition[] = [];
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

/**
 * Every rider lined up on the start grid, the player first: the player on the
 * start line, between the two lanes that run in the race direction, on a bike
 * in `playerCondition`, and the opponents strung out ahead of them, their
 * order drawn from `random`.
 */
export function lineUpRiders(track: Track, random: Random, playerCondition: number = TUNING.fullCondition): Rider[] {
  const riders: Rider[] = [
    {
      ...lineUp({ id: PLAYER, name: PLAYER_NAME, temperament: null, riding: null }, track.startDistance, track.laneWidth),
      condition: Math.min(TUNING.fullCondition, playerCondition),
    },
  ];
  lineUpOpponents(track, OPPONENTS.length, random).forEach(({ distance, offset }, index) => {
    const { name, temperament, skill } = OPPONENTS[index];
    const riding = { pace: paceFor(skill), lane: offset };
    riders.push(lineUp({ id: PLAYER + 1 + index, name, temperament, riding }, distance, offset));
  });
  return riders;
}

/**
 * A rider on the grid: fresh, on a bike in perfect condition, standing at
 * `distance` and `offset`. Bullies start the race with a club.
 */
function lineUp<T extends Pick<Rider, "id" | "name" | "temperament" | "riding">>(rider: T, distance: number, offset: number) {
  return {
    ...rider,
    kind: "rider",
    motion: { distance, offset, speed: 0, steering: 0, shove: 0, kickShove: 0 },
    status: "racing",
    finishTime: null,
    finishOrder: null,
    stamina: TUNING.fullStamina,
    condition: TUNING.fullCondition,
    stepsSinceHit: Infinity,
    attack: null,
    weapon: rider.temperament === "bully" ? "club" : null,
    crash: null,
    droppingBack: false,
    patience: wholePatience(),
    stepsSinceThePlayerHitIt: Infinity,
    breatherSteps: 0,
  } satisfies Omit<Rider, "id" | "name" | "temperament" | "riding"> & T;
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
