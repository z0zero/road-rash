/**
 * The stretch of road a race is run on: a centreline sampled every metre, with
 * the start and finish lines. The renderer builds its meshes from this same
 * data, so the road the riders are simulated on is the road that is drawn.
 *
 * World coordinates are three.js-style: x is east, y is up, z is south.
 */
export interface Track {
  /** Metres of centreline, from its first sample to its last. */
  readonly length: number;
  /** Distance of the start line along the centreline. */
  readonly startDistance: number;
  /** Distance of the finish line along the centreline. */
  readonly finishDistance: number;
  /** The centreline at a distance along it, interpolated between the samples either side. */
  sampleAt(distance: number): TrackSample;
}

export interface TrackSample {
  /** Metres east. */
  readonly x: number;
  /** Metres south. */
  readonly z: number;
  /** Radians: 0 is north (-z), and it grows turning right, so π/2 is east (+x). */
  readonly heading: number;
  /** 1/m: how sharply the road curves; positive curves right. */
  readonly curvature: number;
}

/** A stretch of road whose curvature changes linearly from start to end (1/m; positive curves right). */
export interface Bend {
  readonly length: number;
  readonly startCurvature: number;
  readonly endCurvature: number;
}

/** What a track is built from. */
export interface TrackLayout {
  readonly bends: readonly Bend[];
  readonly startDistance: number;
  readonly finishDistance: number;
}

/** Integration sub-steps per metre of centreline. */
const SUBSTEPS = 8;

export function buildTrack(layout: TrackLayout): Track {
  const length = Math.floor(layout.bends.reduce((total, bend) => total + bend.length, 0));
  const count = length + 1;
  const xs = new Float64Array(count);
  const zs = new Float64Array(count);
  const headings = new Float64Array(count);
  const curvatures = new Float64Array(count);

  const curvature = curvatureProfile(layout.bends);
  let x = 0;
  let z = 0;
  let heading = 0;
  const h = 1 / SUBSTEPS;
  for (let i = 0; i < count; i++) {
    xs[i] = x;
    zs[i] = z;
    headings[i] = heading;
    curvatures[i] = curvature(i);
    for (let k = 0; k < SUBSTEPS && i < length; k++) {
      const s = i + k * h;
      const start = curvature(s);
      const middle = curvature(s + h / 2);
      const end = curvature(s + h);
      const midHeading = heading + ((start + middle) / 2) * (h / 2);
      x += Math.sin(midHeading) * h;
      z -= Math.cos(midHeading) * h;
      heading += ((start + 4 * middle + end) / 6) * h;
    }
  }

  return {
    length,
    startDistance: layout.startDistance,
    finishDistance: layout.finishDistance,
    sampleAt(distance) {
      const d = Math.min(length, Math.max(0, distance));
      const i = Math.min(length - 1, Math.floor(d));
      const t = d - i;
      return {
        x: lerp(xs[i], xs[i + 1], t),
        z: lerp(zs[i], zs[i + 1], t),
        heading: lerp(headings[i], headings[i + 1], t),
        curvature: lerp(curvatures[i], curvatures[i + 1], t),
      };
    },
  };
}

/** Curvature at any distance along a sequence of bends; zero beyond its ends. */
function curvatureProfile(bends: readonly Bend[]) {
  const starts: number[] = [];
  let total = 0;
  for (const bend of bends) {
    starts.push(total);
    total += bend.length;
  }
  return (distance: number) => {
    let low = 0;
    let high = bends.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= distance) low = mid;
      else high = mid - 1;
    }
    const bend = bends[low];
    if (!bend || distance < 0 || distance > total) return 0;
    const t = bend.length > 0 ? (distance - starts[low]) / bend.length : 0;
    return lerp(bend.startCurvature, bend.endCurvature, Math.min(1, Math.max(0, t)));
  };
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}
