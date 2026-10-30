import { type BufferGeometry, Color } from "three";
import { clamp, smoothstep } from "@/math";
import type { Side, Track, WorldPoint } from "@/race";
import { groundDirection, seaward } from "./geography";
import { geometryFrom } from "./low-poly";
import { hash, smoothNoise } from "./noise";

/**
 * The land either side of the road, built from the track's own centreline: a
 * ditch, then cliffs rising on the inland side, and on the sea side a strip
 * of land beyond the shoulder where the guard rails stand, then a drop to
 * below sea level. Each side
 * reaches out until it meets the land of another stretch of road (or the
 * middle of a tight bend), where a skirt drops it out of sight.
 */
export interface Terrain {
  /** Metres above sea level of the ground at a world position near the road. */
  groundAt(x: number, z: number): number;
  /** How steep the ground is at a world position near the road: the most it rises or falls over a metre, any way. */
  slopeAt(x: number, z: number): number;
  /** The land between two distances along the track, flat-shaded with a colour per face. */
  buildGeometry(fromDistance: number, toDistance: number): BufferGeometry;
}

/** Metres between the terrain's cross-sections. */
const SPACING = 4;
/** Points across each side of a cross-section, from under the shoulder's edge outwards; the last is the skirt. */
const POINTS = 10;
/** No side reaches further from the centreline than this (metres). */
const MAX_REACH = 280;
/** Metres above sea level that skirts drop to. */
const SKIRT_DEPTH = -30;

const terrains = new WeakMap<Track, Terrain>();

/** The terrain for a track, built once and shared. */
export function terrainFor(track: Track): Terrain {
  let terrain = terrains.get(track);
  if (!terrain) {
    terrain = createTerrain(track);
    terrains.set(track, terrain);
  }
  return terrain;
}

function createTerrain(track: Track): Terrain {
  const count = Math.floor(track.length / SPACING) + 1;
  const xs = new Float64Array(count);
  const zs = new Float64Array(count);
  const rightX = new Float64Array(count);
  const rightZ = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const { x, z, heading } = track.sampleAt(i * SPACING);
    const right = groundDirection(heading + Math.PI / 2);
    xs[i] = x;
    zs[i] = z;
    rightX[i] = right.x;
    rightZ[i] = right.z;
  }

  const coast = coastlineOf(track, xs, zs);

  // Each side's cross-section: lateral distances from the centreline and heights above sea level.
  const lateral = [new Float64Array(count * POINTS), new Float64Array(count * POINTS)];
  const height = [new Float64Array(count * POINTS), new Float64Array(count * POINTS)];
  const shape = { lateral: new Float64Array(POINTS), height: new Float64Array(POINTS) };
  for (let i = 0; i < count; i++) {
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      crossSection(track, i, side, reachOf(i, side), (l) => spreadAt(i, side, l), shape);
      // Whatever lies further out than the coastline plunges into the sea.
      const top = track.pointAt(i * SPACING, side * (track.roadHalfWidth + track.shoulderWidth)).y + 2;
      for (let k = 2; k < POINTS - 1; k++) {
        const l = shape.lateral[k];
        const beyond = coast.beyond(xs[i] + side * rightX[i] * l, zs[i] + side * rightZ[i] * l);
        if (beyond > 0) shape.height[k] = Math.min(shape.height[k], top - 2.8 * beyond);
      }
      lateral[s].set(shape.lateral, i * POINTS);
      height[s].set(shape.height, i * POINTS);
    }
  }

  /**
   * How far a side may reach: up to the line halfway between this stretch of road and any other.
   * For a point l metres along the outward normal n from centreline point c, another centreline
   * point q is nearer once l > |q - c|² / 2 n·(q - c); the same rule stops the inside of a bend
   * at its centre.
   */
  function reachOf(i: number, side: Side) {
    const nx = side * rightX[i];
    const nz = side * rightZ[i];
    let best = MAX_REACH;
    for (let j = 0; j < count; j++) {
      const dx = xs[j] - xs[i];
      const dz = zs[j] - zs[i];
      const towards = nx * dx + nz * dz;
      if (towards <= 1e-6) continue;
      const crossing = (dx * dx + dz * dz) / (2 * towards);
      if (crossing < best) best = crossing;
    }
    return best;
  }

  /**
   * How far apart the points `l` metres out on one side of section `i` and of its neighbours are,
   * along the road, as a share of the sections' spacing: 1 on a straight and on the outside of a
   * bend, less on the inside, where the sections close in on the bend's centre, and 0 there and beyond.
   */
  function spreadAt(i: number, side: Side, l: number) {
    const before = Math.max(0, i - 1);
    const after = Math.min(count - 1, i + 1);
    // Forward is a quarter turn anticlockwise from the right.
    const dx = xs[after] - xs[before] + side * l * (rightX[after] - rightX[before]);
    const dz = zs[after] - zs[before] + side * l * (rightZ[after] - rightZ[before]);
    return clamp((dx * rightZ[i] - dz * rightX[i]) / ((after - before) * SPACING), 0, 1);
  }

  /** The ground's height `l` metres out on one side of section `i`, along its cross-section. */
  function heightAcross(s: number, i: number, l: number) {
    const base = i * POINTS;
    const lat = lateral[s];
    const hgt = height[s];
    if (l <= lat[base]) return hgt[base];
    for (let k = 1; k < POINTS - 1; k++) {
      const l1 = lat[base + k];
      if (l <= l1) {
        const l0 = lat[base + k - 1];
        const t = l1 > l0 ? (l - l0) / (l1 - l0) : 1;
        return hgt[base + k - 1] + (hgt[base + k] - hgt[base + k - 1]) * t;
      }
    }
    return hgt[base + POINTS - 2];
  }

  // A coarse grid of the sections, to find the stretch of road nearest a point quickly.
  const CELL = 64;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.floor(xs[i] / CELL)},${Math.floor(zs[i] / CELL)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }

  function nearestSection(x: number, z: number) {
    let best = 0;
    let bestDistance = Infinity;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    // Widen the search ring by ring until nothing outside it could be nearer.
    for (let ring = 1; ring <= 8; ring++) {
      for (let a = -ring; a <= ring; a++) {
        for (let b = -ring; b <= ring; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== ring && ring > 1) continue;
          for (const i of grid.get(`${cx + a},${cz + b}`) ?? []) {
            const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
            if (d < bestDistance) {
              bestDistance = d;
              best = i;
            }
          }
        }
      }
      if (bestDistance <= (ring * CELL) ** 2) break;
    }
    return best;
  }

  /** Metres above sea level of the ground at (x, z). */
  function groundAt(x: number, z: number): number {
    const i = nearestSection(x, z);
    const dx = x - xs[i];
    const dz = z - zs[i];
    const across = dx * rightX[i] + dz * rightZ[i];
    // Forward is a quarter turn anticlockwise from the right.
    const along = dx * rightZ[i] - dz * rightX[i];
    const s = across < 0 ? 0 : 1;
    const at = Math.min(count - 1, Math.max(0, i + along / SPACING));
    const i0 = Math.min(count - 2, Math.floor(at));
    const t = at - i0;
    const l = Math.abs(across);
    return heightAcross(s, i0, l) * (1 - t) + heightAcross(s, i0 + 1, l) * t;
  }

  return {
    groundAt,

    slopeAt(x, z) {
      const y = groundAt(x, z);
      let slope = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        slope = Math.max(slope, Math.abs(groundAt(x + dx, z + dz) - y));
      }
      return slope;
    },

    buildGeometry(fromDistance, toDistance) {
      const first = Math.max(0, Math.floor(fromDistance / SPACING));
      const last = Math.min(count - 1, Math.ceil(toDistance / SPACING));
      const positions: number[] = [];
      const colors: number[] = [];
      const point = (s: number, i: number, k: number): WorldPoint => {
        const side = s === 0 ? -1 : 1;
        const l = lateral[s][i * POINTS + k];
        return { x: xs[i] + side * rightX[i] * l, y: height[s][i * POINTS + k], z: zs[i] + side * rightZ[i] * l };
      };
      for (let i = first; i < last; i++) {
        for (let s = 0; s < 2; s++) {
          for (let k = 0; k < POINTS - 1; k++) {
            const nearIn = point(s, i, k);
            const nearOut = point(s, i, k + 1);
            const farIn = point(s, i + 1, k);
            const farOut = point(s, i + 1, k + 1);
            // Counter-clockwise seen from above: left to right across the race direction, near before far.
            const quad: Quad = s === 1 ? [nearIn, nearOut, farOut, farIn] : [nearOut, nearIn, farIn, farOut];
            pushQuad(positions, colors, quad, (i * POINTS + k) * 2 + s, k === POINTS - 2);
          }
        }
      }
      const geometry = geometryFrom(positions, colors);
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

type Quad = [WorldPoint, WorldPoint, WorldPoint, WorldPoint];

/** Metres of coast per step when tracing the coastline. */
const COAST_STEP = 10;
/** The coastline follows the road point furthest out to sea within this many metres along the coast... */
const COAST_WINDOW = 150;
/** ...this many metres further out. */
const COAST_MARGIN = 25;

/**
 * The coastline: a smooth line just beyond the stretches of road furthest out
 * to sea, so a road that heads out to sea and back makes a headland, not a
 * table of land standing in the water.
 */
function coastlineOf(track: Track, xs: Float64Array, zs: Float64Array) {
  // Along the coast is a quarter turn from out to sea.
  const { x: seaX, z: seaZ } = groundDirection(track.seaHeading);
  const along = (x: number, z: number) => -seaZ * x + seaX * z;
  const out = (x: number, z: number) => seaX * x + seaZ * z;
  let first = Infinity;
  let last = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    first = Math.min(first, along(xs[i], zs[i]));
    last = Math.max(last, along(xs[i], zs[i]));
  }
  const steps = Math.ceil((last - first) / COAST_STEP) + 1;
  const furthest = new Float64Array(steps).fill(-Infinity);
  for (let i = 0; i < xs.length; i++) {
    const step = Math.round((along(xs[i], zs[i]) - first) / COAST_STEP);
    furthest[step] = Math.max(furthest[step], out(xs[i], zs[i]));
  }
  const window = Math.round(COAST_WINDOW / COAST_STEP);
  const widest = new Float64Array(steps);
  for (let step = 0; step < steps; step++) {
    let best = -Infinity;
    for (let other = Math.max(0, step - window); other <= Math.min(steps - 1, step + window); other++) {
      best = Math.max(best, furthest[other]);
    }
    widest[step] = best;
  }
  // Smooth the corners out of it.
  const smooth = 6;
  const line = new Float64Array(steps);
  for (let step = 0; step < steps; step++) {
    let total = 0;
    let n = 0;
    for (let other = Math.max(0, step - smooth); other <= Math.min(steps - 1, step + smooth); other++) {
      total += widest[other];
      n++;
    }
    line[step] = total / n + COAST_MARGIN;
  }
  return {
    /** Metres a point lies out to sea beyond the coastline; negative inland of it. */
    beyond(x: number, z: number) {
      const at = Math.min(steps - 1, Math.max(0, (along(x, z) - first) / COAST_STEP));
      const step = Math.min(steps - 2, Math.floor(at));
      const t = at - step;
      return out(x, z) - (line[step] * (1 - t) + line[step + 1] * t);
    },
  };
}

/**
 * Fills `shape` with one side's cross-section at section `i`: the inland cliff
 * or the drop to the sea, blended by how squarely that side faces the sea,
 * roughened as far as `spread` allows (see `spreadAt`), flattened where there
 * is little room and cut off at `reach`.
 */
function crossSection(
  track: Track,
  i: number,
  side: Side,
  reach: number,
  spread: (lateral: number) => number,
  shape: { lateral: Float64Array; height: Float64Array },
) {
  const distance = i * SPACING;
  const { heading } = track.sampleAt(distance);
  const edge = track.roadHalfWidth + track.shoulderWidth;
  const edgeY = track.pointAt(distance, side * edge).y;
  const towardsSea = smoothstep(0.15, 0.65, seaward(heading, side, track.seaHeading));
  const cliff = 7 + 30 * smoothNoise(distance / 140, 1); // metres of cliff face above the road
  const hill = smoothNoise(distance / 320, 2);
  const jag = smoothNoise(distance / 30, 3);
  const drop = edgeY + 10; // metres from the shoulder's edge down to the foot of the sea cliff

  // [lateral, height] from under the shoulder's edge outwards.
  const inland: [number, number][] = [
    [edge - 0.4, edgeY - 0.3],
    [edge + 1.2, edgeY - 0.55],
    [edge + 2.6, edgeY - 0.3],
    [edge + 2.9 + 0.08 * cliff + 1.2 * jag, edgeY + 0.42 * cliff],
    [edge + 3.3 + 0.17 * cliff, edgeY + 0.82 * cliff],
    [edge + 4.5 + 0.27 * cliff, edgeY + cliff],
    [edge + 32 + 0.27 * cliff, edgeY + cliff + 5 + 10 * hill],
    [edge + 95 + 0.27 * cliff, edgeY + cliff + 22 + 30 * hill],
    [edge + 230 + 0.27 * cliff, edgeY + cliff + 70 + 50 * jag],
  ];
  const seaSide: [number, number][] = [
    [edge - 0.4, edgeY - 0.3],
    [edge + 1.4, edgeY - 0.45],
    [edge + 3.8, edgeY - 1.1],
    [edge + 6.5 + 2 * jag, edgeY - 4],
    [edge + 7 + 0.2 * drop, edgeY - 0.42 * drop],
    [edge + 9 + 0.34 * drop, edgeY - 0.8 * drop],
    [edge + 16 + 0.42 * drop, -4],
    [edge + 45 + 0.46 * drop, -12],
    [edge + 140 + 0.46 * drop, -24],
  ];
  // Where another stretch of road comes close, keep the land near the road's own level.
  const room = smoothstep(edge + 10, edge + 45, reach);
  const seed = i * POINTS * 2 + (side + 1);
  const lateralOf = (k: number) => inland[k][0] + (seaSide[k][0] - inland[k][0]) * towardsSea;
  for (let k = 0; k < POINTS - 1; k++) {
    let l = lateralOf(k);
    let h = inland[k][1] + (seaSide[k][1] - inland[k][1]) * towardsSea;
    if (k >= 3) {
      // Roughen the rock and the slopes into facets a few cross-sections wide, with a little
      // jitter on top, so the faces read as rock rather than as stripes. Where the sections close
      // in on the inside of a bend, the faces narrow towards its centre, and a point is roughened
      // only as much as the narrow end of the face outside it allows: as much as elsewhere would
      // twist the narrowing faces into a fan of stripes.
      const rough = spread(k < POINTS - 2 ? lateralOf(k + 1) : l);
      const relief = smoothNoise(distance / 14 + k * 3.7, 10 + side) - 0.5;
      const bump = smoothNoise(distance / 11 + k * 5.3, 20 + side) - 0.5;
      l += rough * (relief * 3 + (hash(seed * 31 + k * 7) - 0.5) * 0.6);
      h += rough * (bump * 2.4 + (hash(seed * 17 + k * 13) - 0.5) * 0.5);
    }
    shape.lateral[k] = k === 0 ? l : Math.max(l, shape.lateral[k - 1] + 0.3);
    shape.height[k] = k < 2 ? h : edgeY + (h - edgeY) * room;
  }
  // Cut the cross-section off where it meets the next stretch's land.
  for (let k = 1; k < POINTS - 1; k++) {
    if (shape.lateral[k] <= reach) continue;
    const l0 = shape.lateral[k - 1];
    const end = Math.max(reach, l0);
    const t = (end - l0) / (shape.lateral[k] - l0);
    const cut = shape.height[k - 1] + (shape.height[k] - shape.height[k - 1]) * t;
    for (let rest = k; rest < POINTS - 1; rest++) {
      shape.lateral[rest] = end;
      shape.height[rest] = cut;
    }
    break;
  }
  shape.lateral[POINTS - 1] = shape.lateral[POINTS - 2];
  shape.height[POINTS - 1] = SKIRT_DEPTH;
}

const ROCK = [new Color("#b06a43"), new Color("#c27f4f"), new Color("#94573a"), new Color("#a5643f")];
const DARK_ROCK = new Color("#5b3d36");
const SCRUB = [new Color("#8f7444"), new Color("#7b7340")];
const GRASS = [new Color("#8c8a48"), new Color("#76803f"), new Color("#9c8f50")];
const SAND = new Color("#cdb088");
const scratch = new Color();

/** Adds a quad as two triangles, each coloured by its slope and height: rock, scrub, grass or the shore. */
function pushQuad(positions: number[], colors: number[], [a, b, c, d]: Quad, seed: number, skirt: boolean) {
  const triangles: [WorldPoint, WorldPoint, WorldPoint][] = [
    [a, b, c],
    [a, c, d],
  ];
  triangles.forEach(([p, q, r], index) => {
    // How much the triangle faces up: the y part of its unit normal.
    const ux = q.x - p.x;
    const uy = q.y - p.y;
    const uz = q.z - p.z;
    const vx = r.x - p.x;
    const vy = r.y - p.y;
    const vz = r.z - p.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    // Where a cross-section is cut short, its points stack up on one spot, and their triangles cover
    // nothing: they would have no normal to light them by, and the odd pixel of one would come out
    // not a number.
    const twiceArea = Math.hypot(nx, ny, nz);
    if (twiceArea < 1e-6) return;
    const up = ny / twiceArea;
    const middle = (p.y + q.y + r.y) / 3;
    // Patches a few tens of metres across, so neighbouring faces mostly share a colour.
    const patch = smoothNoise((p.x + p.z * 0.7) / 23, 30);
    if (skirt) scratch.copy(DARK_ROCK);
    else if (middle < 1.2) scratch.copy(up > 0.8 ? SAND : DARK_ROCK);
    else if (up < 0.6) {
      // Sandstone in strata a few metres thick.
      const stratum = Math.floor(middle / 3.2);
      scratch.copy(ROCK[Math.floor(hash(stratum * 977) * ROCK.length)]);
    } else if (up < 0.85) scratch.copy(SCRUB[patch < 0.5 ? 0 : 1]);
    else scratch.copy(GRASS[Math.min(GRASS.length - 1, Math.floor(patch * GRASS.length))]);
    scratch.multiplyScalar(0.93 + 0.12 * hash(seed * 2 + index));
    for (const point of [p, q, r]) {
      positions.push(point.x, point.y, point.z);
      colors.push(scratch.r, scratch.g, scratch.b);
    }
  });
}
