import { createGroundGrid } from "./ground-grid";
import type { Random } from "./random";
import type { Track, TrackPosition, WorldPoint } from "./track";

export type SceneryKind = "palm" | "pine" | "rock" | "house" | "sign" | "guard-rail";

/** Something beside the road that nobody can hit: it stands beyond the shoulders of every stretch of road. */
export interface SceneryPlacement extends TrackPosition {
  readonly kind: SceneryKind;
  /** Radians turned about the vertical, relative to the road's heading at `distance`. */
  readonly yaw: number;
  /** Size relative to the kind's usual size. */
  readonly scale: number;
}

export type ObstacleKind = "rock" | "sign" | "post" | "fallen-rock";

/** A fixed object that makes a rider who runs into it crash. */
export interface ObstaclePlacement extends TrackPosition {
  readonly kind: ObstacleKind;
  /** Metres from its centre within which a rider hits it. */
  readonly radius: number;
}

type Road = Pick<
  Track,
  "length" | "startDistance" | "finishDistance" | "roadHalfWidth" | "shoulderWidth" | "sampleAt" | "pointAt" | "seaHeading"
>;

/** Guard rails come in segments this long (metres). */
const GUARD_RAIL_SEGMENT = 4;
/** Palms grow below this elevation and pines above it (metres above sea level). */
const TREE_LINE = 62;

/**
 * Scenery for a coastal road: guard rails on the sea side, trees, rocks and
 * houses mostly inland, and warning signs before sharp bends. Listed in order
 * along the track.
 */
export function placeScenery(road: Road, random: Random): SceneryPlacement[] {
  const clear = clearanceFrom(road);
  const edge = road.roadHalfWidth + road.shoulderWidth;
  const placed: SceneryPlacement[] = [];
  const place = (kind: SceneryKind, distance: number, offset: number, margin: number, yaw: number, scale: number) => {
    if (distance < 0 || distance > road.length) return;
    if (clear(road.pointAt(distance, offset)) >= edge + margin) placed.push({ kind, distance, offset, yaw, scale });
  };

  // Guard rails along the sea side, in runs with gaps.
  let railing = random.chance(0.5);
  let switchAt = random.between(40, 160);
  for (let d = 0; d + GUARD_RAIL_SEGMENT <= road.length; d += GUARD_RAIL_SEGMENT) {
    if (d >= switchAt) {
      railing = !railing;
      switchAt = d + (railing ? random.between(60, 260) : random.between(20, 140));
    }
    const sea = seaSide(road, d + GUARD_RAIL_SEGMENT / 2);
    if (railing && sea !== 0) place("guard-rail", d, sea * (edge + 0.5), 0.3, 0, 1);
  }

  // Trees, mostly inland: palms down low, pines up high.
  for (let d = random.between(0, 10); d < road.length; d += random.between(9, 24)) {
    const side = inlandSide(road, d, random, 0.8);
    const kind = road.sampleAt(d).y < TREE_LINE ? "palm" : "pine";
    const offset = side * (edge + random.between(2.5, 32));
    place(kind, d, offset, 2, random.between(-Math.PI, Math.PI), random.between(0.8, 1.3));
  }

  // Rocks on either side.
  for (let d = random.between(0, 30); d < road.length; d += random.between(25, 70)) {
    const offset = random.sign() * (edge + random.between(1.5, 25));
    place("rock", d, offset, 1.5, random.between(-Math.PI, Math.PI), random.between(0.6, 1.8));
  }

  // Small houses inland, facing the road.
  for (let d = random.between(150, 400); d < road.length; d += random.between(350, 750)) {
    const side = inlandSide(road, d, random, 1);
    const offset = side * (edge + random.between(14, 28));
    place("house", d, offset, 10, side * (Math.PI / 2) + random.between(-0.2, 0.2), random.between(0.9, 1.2));
  }

  // A warning sign on the right, about 90 m before each sharp bend that follows a clear stretch.
  let lastSharp = -Infinity;
  for (let d = 0; d < road.length; d++) {
    const sharp = Math.abs(road.sampleAt(d).curvature) >= 1 / 90;
    if (sharp && d - lastSharp > 200) place("sign", d - 90, edge + 1.2, 0.8, 0, 1);
    if (sharp) lastSharp = d;
  }

  return placed.sort((a, b) => a.distance - b.distance);
}

/**
 * Obstacles between the start and the finish: rocks, signs and posts on the
 * shoulders, and fallen rocks on the road near some hairpins. Listed in order
 * along the track.
 */
export function placeObstacles(road: Road, random: Random): ObstaclePlacement[] {
  const placed: ObstaclePlacement[] = [];
  const shoulder = (min: number, max: number) =>
    random.sign() * (road.roadHalfWidth + random.between(min, max) * road.shoulderWidth);

  for (let d = road.startDistance + 300; d < road.finishDistance - 50; d += random.between(140, 320)) {
    const roll = random.next();
    if (roll < 0.5) placed.push({ kind: "rock", distance: d, offset: shoulder(0.3, 0.8), radius: random.between(0.5, 0.9) });
    else if (roll < 0.75) placed.push({ kind: "sign", distance: d, offset: shoulder(0.4, 0.9), radius: 0.3 });
    else placed.push({ kind: "post", distance: d, offset: shoulder(0.4, 0.9), radius: 0.2 });
  }

  const apexes = hairpinApexes(road);
  apexes.forEach((apex, index) => {
    const last = index === apexes.length - 1;
    const none = !placed.some((obstacle) => obstacle.kind === "fallen-rock");
    if (!random.chance(0.6) && !(last && none)) return;
    const distance = apex + random.between(-60, 40);
    const offset = random.between(-road.roadHalfWidth + 1.5, road.roadHalfWidth - 1.5);
    placed.push({ kind: "fallen-rock", distance, offset, radius: random.between(0.6, 0.9) });
  });

  return placed.sort((a, b) => a.distance - b.distance);
}

/** Distances of the tightest point of every hairpin (a bend tighter than 30 m) between the start and the finish. */
function hairpinApexes(road: Road) {
  const apexes: number[] = [];
  let best = -1;
  let bestCurvature = 0;
  for (let d = road.startDistance; d <= road.finishDistance; d++) {
    const curvature = Math.abs(road.sampleAt(d).curvature);
    if (curvature >= 1 / 30) {
      if (curvature > bestCurvature) {
        best = d;
        bestCurvature = curvature;
      }
    } else if (best >= 0) {
      if (apexes.length === 0 || best - apexes[apexes.length - 1] > 200) apexes.push(best);
      best = -1;
      bestCurvature = 0;
    }
  }
  return apexes;
}

/** Which side of the road the sea is on at a distance: -1 left, 1 right, 0 neither (the road heads out to sea or inland). */
function seaSide(road: Road, distance: number): -1 | 0 | 1 {
  // How squarely the right of the road, a quarter turn clockwise from its heading, faces the sea.
  const seaOnTheRight = Math.cos(road.sampleAt(distance).heading + Math.PI / 2 - road.seaHeading);
  if (seaOnTheRight > 0.35) return 1;
  if (seaOnTheRight < -0.35) return -1;
  return 0;
}

/** The inland side at a distance, or (with probability 1 - `inland`) the sea side; either side where there is no sea. */
function inlandSide(road: Road, distance: number, random: Random, inland: number) {
  const sea = seaSide(road, distance);
  if (sea === 0) return random.sign();
  return random.chance(inland) ? -sea : sea;
}

/** How far a point is from the nearest stretch of centreline, on the ground (capped at 60 m). */
function clearanceFrom(road: Road) {
  const cell = 20;
  const reach = 60;
  const grid = createGroundGrid<WorldPoint>(cell);
  for (let d = 0; d <= road.length; d += 2) {
    const point = road.sampleAt(d);
    grid.add(point.x, point.z, point);
  }
  const span = Math.ceil(reach / cell);
  return (point: WorldPoint) => {
    let nearest = reach;
    grid.forEachNear(point.x, point.z, span, (other) => {
      nearest = Math.min(nearest, Math.hypot(point.x - other.x, point.z - other.z));
    });
    return nearest;
  };
}
