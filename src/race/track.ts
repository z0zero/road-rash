import type { ObstaclePlacement, SceneryPlacement } from "./placements";

/**
 * The stretch of road a race is run on: a centreline sampled every metre, with
 * the start and finish lines and where its scenery and obstacles stand. The
 * renderer builds its meshes from this same data, so the road the riders are
 * simulated on is the road that is drawn.
 *
 * World coordinates are three.js-style: x is east, y is up (metres above sea
 * level), z is south.
 */
export interface Track {
  /** Metres of centreline, from its first sample to its last. */
  readonly length: number;
  /** Distance of the start line along the centreline. */
  readonly startDistance: number;
  /** Distance of the finish line along the centreline. */
  readonly finishDistance: number;
  /**
   * Metres per lane. The road has four lanes: the two right of the centreline
   * run in the race direction, the two left of it carry oncoming traffic.
   */
  readonly laneWidth: number;
  /** Metres from the centreline to either edge of the road. */
  readonly roadHalfWidth: number;
  /** Metres of shoulder outside each edge of the road; nobody rides beyond them. */
  readonly shoulderWidth: number;
  /** The centreline at a distance along it, interpolated between the samples either side. */
  sampleAt(distance: number): TrackSample;
  /** The point on the (banked) road surface `offset` metres right of the centreline at a distance. */
  pointAt(distance: number, offset: number): WorldPoint;
  /** How much of the race distance lies behind a distance: 0 at or before the start line, 1 at or after the finish line. */
  progressAt(distance: number): number;
  /**
   * Radians: the compass heading from the coast out to sea, as `TrackSample.heading`
   * measures it. The sea lies below the road on that side; cliffs rise on the other.
   */
  readonly seaHeading: number;
  /** Everything beside the road that nobody can hit, in order along the track. */
  readonly scenery: readonly SceneryPlacement[];
  /** Everything on or beside the road that crashes riders who hit it, in order along the track. */
  readonly obstacles: readonly ObstaclePlacement[];
}

/** Where something is in track space. */
export interface TrackPosition {
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres sideways from the centreline; positive is right of the race direction. */
  readonly offset: number;
}

/** Where something is in track space, and how fast it goes along the track. */
export interface Moving extends TrackPosition {
  /** Metres per second along the track; negative when going back down it. */
  readonly speed: number;
}

/** A side of the road, or of someone on it: -1 the left and 1 the right, facing the race direction. */
export type Side = -1 | 1;

/** A point in world coordinates, in metres. */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrackSample {
  /** Metres east. */
  readonly x: number;
  /** Metres above sea level. */
  readonly y: number;
  /** Metres south. */
  readonly z: number;
  /** Radians: 0 is north (-z), and it grows turning right, so π/2 is east (+x). */
  readonly heading: number;
  /** 1/m: how sharply the road curves; positive curves right. */
  readonly curvature: number;
  /** Metres of climb per metre along the road; negative descends. */
  readonly grade: number;
  /** Radians the road is tilted across; positive tilts it down to the right, into right-hand bends. */
  readonly bank: number;
}

/** A stretch of road whose curvature changes linearly from start to end (1/m; positive curves right). */
export interface Bend {
  readonly length: number;
  readonly startCurvature: number;
  readonly endCurvature: number;
}

/** A stretch of road whose grade changes linearly from start to end. */
export interface Slope {
  readonly length: number;
  readonly startGrade: number;
  readonly endGrade: number;
}

/** What a track is built from. */
export interface TrackLayout {
  readonly bends: readonly Bend[];
  readonly slopes: readonly Slope[];
  /** Metres above sea level at the start of the centreline. */
  readonly startElevation: number;
  readonly startDistance: number;
  readonly finishDistance: number;
  /** Radians: the compass heading from the coast out to sea. */
  readonly seaHeading: number;
}

const LANE_WIDTH = 3;
const LANES = 4;
const SHOULDER_WIDTH = 3;
/** Integration sub-steps per metre of centreline. */
const SUBSTEPS = 8;
/** Roads bank into their bends by this many radians per unit of curvature (1/m)... */
const BANK_PER_CURVATURE = 3;
/** ...up to this many radians. */
const MAX_BANK = 0.13;

/** Builds a track's road from its layout; it has no scenery or obstacles yet. */
export function buildTrack(layout: TrackLayout): Track {
  const length = Math.floor(layout.bends.reduce((total, bend) => total + bend.length, 0));
  const count = length + 1;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);
  const headings = new Float64Array(count);
  const curvatures = new Float64Array(count);
  const grades = new Float64Array(count);

  const curvature = linearProfile(layout.bends.map((b) => [b.length, b.startCurvature, b.endCurvature]));
  const grade = linearProfile(layout.slopes.map((s) => [s.length, s.startGrade, s.endGrade]));
  let x = 0;
  let y = layout.startElevation;
  let z = 0;
  let heading = 0;
  const h = 1 / SUBSTEPS;
  for (let i = 0; i < count; i++) {
    xs[i] = x;
    ys[i] = y;
    zs[i] = z;
    headings[i] = heading;
    curvatures[i] = curvature(i);
    grades[i] = grade(i);
    for (let k = 0; k < SUBSTEPS && i < length; k++) {
      const s = i + k * h;
      const start = curvature(s);
      const middle = curvature(s + h / 2);
      const end = curvature(s + h);
      const midHeading = heading + ((start + middle) / 2) * (h / 2);
      x += Math.sin(midHeading) * h;
      z -= Math.cos(midHeading) * h;
      heading += ((start + 4 * middle + end) / 6) * h;
      y += ((grade(s) + 4 * grade(s + h / 2) + grade(s + h)) / 6) * h;
    }
  }

  const { startDistance, finishDistance } = layout;

  function sampleAt(distance: number): TrackSample {
    const d = Math.min(length, Math.max(0, distance));
    const i = Math.min(length - 1, Math.floor(d));
    const t = d - i;
    return {
      x: lerp(xs[i], xs[i + 1], t),
      y: lerp(ys[i], ys[i + 1], t),
      z: lerp(zs[i], zs[i + 1], t),
      heading: lerp(headings[i], headings[i + 1], t),
      curvature: lerp(curvatures[i], curvatures[i + 1], t),
      grade: lerp(grades[i], grades[i + 1], t),
      bank: bankFor(lerp(curvatures[i], curvatures[i + 1], t)),
    };
  }

  return {
    length,
    startDistance,
    finishDistance,
    laneWidth: LANE_WIDTH,
    roadHalfWidth: (LANE_WIDTH * LANES) / 2,
    shoulderWidth: SHOULDER_WIDTH,
    sampleAt,
    pointAt(distance, offset) {
      const centre = sampleAt(distance);
      const across = offset * Math.cos(centre.bank);
      return {
        // Right of the heading is (cos, sin) in (x, z).
        x: centre.x + Math.cos(centre.heading) * across,
        y: centre.y - offset * Math.sin(centre.bank),
        z: centre.z + Math.sin(centre.heading) * across,
      };
    },
    progressAt(distance) {
      return Math.min(1, Math.max(0, (distance - startDistance) / (finishDistance - startDistance)));
    },
    seaHeading: layout.seaHeading,
    scenery: [],
    obstacles: [],
  };
}

/**
 * A value along the road made of pieces `[length, startValue, endValue]`, each
 * changing linearly; it holds its last value beyond the end.
 */
function linearProfile(pieces: readonly (readonly [number, number, number])[]) {
  const starts: number[] = [];
  let total = 0;
  for (const [length] of pieces) {
    starts.push(total);
    total += length;
  }
  return (distance: number) => {
    if (pieces.length === 0) return 0;
    let low = 0;
    let high = pieces.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= distance) low = mid;
      else high = mid - 1;
    }
    const [length, start, end] = pieces[low];
    const t = length > 0 ? (distance - starts[low]) / length : 1;
    return lerp(start, end, Math.min(1, Math.max(0, t)));
  };
}

function bankFor(curvature: number) {
  return Math.max(-MAX_BANK, Math.min(MAX_BANK, curvature * BANK_PER_CURVATURE));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

/** Metres between two positions in track space (straight-line). */
export function apart(a: TrackPosition, b: TrackPosition): number {
  return Math.hypot(a.distance - b.distance, a.offset - b.offset);
}
