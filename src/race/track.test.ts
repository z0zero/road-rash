import { describe, expect, it } from "vitest";
import { createRace, PLAYER, type Track } from ".";

const { track } = createRace({ seed: 1 });
const DEGREES = Math.PI / 180;

/** Start distances of the places where the road turns through at least 150° within 150 m. */
function hairpins(track: Track) {
  const found: number[] = [];
  for (let d = track.startDistance; d + 150 <= track.finishDistance; d += 5) {
    const turn = Math.abs(track.sampleAt(d + 150).heading - track.sampleAt(d).heading);
    if (turn >= 150 * DEGREES && !found.some((start) => d - start < 300)) found.push(d);
  }
  return found;
}

/** The tightest radius of the road between two distances, in metres. */
function tightestRadius(track: Track, from: number, to: number) {
  let curvature = 0;
  for (let d = from; d <= to; d++) curvature = Math.max(curvature, Math.abs(track.sampleAt(d).curvature));
  return 1 / curvature;
}

/** Distances of the crests where a climb of at least 4% turns into a descent of at least 4% within 100 m. */
function crests(track: Track) {
  const found: number[] = [];
  for (let d = track.startDistance; d + 100 <= track.finishDistance; d += 5) {
    const climbing = track.sampleAt(d).grade >= 0.04;
    const descending = track.sampleAt(d + 100).grade <= -0.04;
    if (climbing && descending && !found.some((crest) => d - crest < 200)) found.push(d);
  }
  return found;
}

/** How close a world position comes to the centreline anywhere along the track, in metres on the ground. */
function nearestCentreline(track: Track, position: { x: number; z: number }) {
  let nearest = Infinity;
  for (let d = 0; d <= track.length; d += 2) {
    const { x, z } = track.sampleAt(d);
    nearest = Math.min(nearest, Math.hypot(x - position.x, z - position.z));
  }
  return nearest;
}

/** Lengths of the stretches that curve one way with a radius between 120 m and 600 m. */
function sweepers(track: Track) {
  const lengths: number[] = [];
  let runStart: number | null = null;
  let runSign = 0;
  for (let d = track.startDistance; d <= track.finishDistance; d++) {
    const curvature = track.sampleAt(d).curvature;
    const sweeping = Math.abs(curvature) >= 1 / 600 && Math.abs(curvature) <= 1 / 120;
    if (runStart !== null && (!sweeping || Math.sign(curvature) !== runSign)) {
      lengths.push(d - runStart);
      runStart = null;
    }
    if (sweeping && runStart === null) {
      runStart = d;
      runSign = Math.sign(curvature);
    }
  }
  return lengths;
}

describe("the coastal track", () => {
  it("runs about 7 km from the start line to the finish line", () => {
    const raceDistance = track.finishDistance - track.startDistance;

    expect(raceDistance).toBeGreaterThan(6800);
    expect(raceDistance).toBeLessThan(7200);
    expect(track.startDistance).toBeGreaterThan(0);
    expect(track.finishDistance).toBeLessThan(track.length);
  });

  it("is a centreline sampled every metre, each sample heading towards the next", () => {
    for (let distance = 0; distance + 1 <= track.length; distance++) {
      const here = track.sampleAt(distance);
      const next = track.sampleAt(distance + 1);
      const heading = (here.heading + next.heading) / 2;

      expect(Math.hypot(next.x - here.x, next.z - here.z)).toBeCloseTo(1, 3);
      // Heading 0 is north (-z) and a quarter turn right is east (+x).
      expect(next.x - here.x).toBeCloseTo(Math.sin(heading), 3);
      expect(next.z - here.z).toBeCloseTo(-Math.cos(heading), 3);
    }
  });

  it("has tight hairpins", () => {
    const found = hairpins(track);

    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const start of found) expect(tightestRadius(track, start, start + 150)).toBeLessThanOrEqual(30);
  });

  it("has long sweepers", () => {
    expect(sweepers(track).filter((length) => length >= 150).length).toBeGreaterThanOrEqual(4);
  });

  it("rises and falls over blind crests", () => {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let d = track.startDistance; d <= track.finishDistance; d++) {
      lowest = Math.min(lowest, track.sampleAt(d).y);
      highest = Math.max(highest, track.sampleAt(d).y);
    }

    expect(highest - lowest).toBeGreaterThanOrEqual(40);
    expect(crests(track).length).toBeGreaterThanOrEqual(4);
  });

  it("climbs as steeply as its grade says, staying high above the sea", () => {
    for (let distance = 0; distance + 1 <= track.length; distance++) {
      const here = track.sampleAt(distance);
      const next = track.sampleAt(distance + 1);

      expect(next.y - here.y).toBeCloseTo((here.grade + next.grade) / 2, 3);
      expect(here.y).toBeGreaterThanOrEqual(15);
    }
  });

  it("banks into its bends and lies flat on its straights", () => {
    for (let distance = 0; distance <= track.length; distance++) {
      const { curvature, bank } = track.sampleAt(distance);
      if (Math.abs(curvature) >= 1 / 150) {
        expect(Math.sign(bank)).toBe(Math.sign(curvature));
        expect(Math.abs(bank)).toBeGreaterThanOrEqual(1 * DEGREES);
      }
      if (curvature === 0) expect(bank).toBe(0);
      expect(Math.abs(bank)).toBeLessThanOrEqual(8 * DEGREES);
    }
  });

  it("never runs into itself: stretches of road far apart along the track stay at least 30 m apart", () => {
    const points: { d: number; x: number; z: number }[] = [];
    for (let d = 0; d <= track.length; d += 5) points.push({ d, ...track.sampleAt(d) });
    let closest = Infinity;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (points[j].d - points[i].d <= 150) continue;
        closest = Math.min(closest, Math.hypot(points[j].x - points[i].x, points[j].z - points[i].z));
      }
    }

    expect(closest).toBeGreaterThanOrEqual(30);
  });

  it("places points across the road on its banked surface, positive offsets to the right", () => {
    const bendy = hairpins(track)[0] + 75;
    for (const distance of [track.startDistance + 100, 2500.5, bendy]) {
      const centre = track.sampleAt(distance);
      const forward = { x: Math.sin(centre.heading), z: -Math.cos(centre.heading) };
      for (const offset of [-8, -3, 4.5]) {
        const point = track.pointAt(distance, offset);
        const across = { x: point.x - centre.x, y: point.y - centre.y, z: point.z - centre.z };

        expect(Math.hypot(across.x, across.y, across.z)).toBeCloseTo(Math.abs(offset), 6);
        expect(across.x * forward.x + across.z * forward.z).toBeCloseTo(0, 6);
        // Right of the direction of travel: forward × across points down (-y) for positive offsets.
        expect(Math.sign(forward.z * across.x - forward.x * across.z)).toBe(-Math.sign(offset));
        // Banked into a right-hand bend, the right side is lower.
        expect(Math.sign(across.y)).toBeCloseTo(-Math.sign(offset) * Math.sign(centre.bank));
      }
    }
  });

  it("measures progress from 0 at the start line to 1 at the finish line", () => {
    const halfway = (track.startDistance + track.finishDistance) / 2;

    expect(track.progressAt(track.startDistance)).toBe(0);
    expect(track.progressAt(halfway)).toBeCloseTo(0.5, 9);
    expect(track.progressAt(track.finishDistance)).toBe(1);
    expect(track.progressAt(0)).toBe(0);
    expect(track.progressAt(track.length)).toBe(1);
  });

  it("lines the road with palms, pines, rocks, houses, signs and guard rails, all clear of the road", () => {
    const kinds = new Set(track.scenery.map((item) => item.kind));
    const edge = track.roadHalfWidth + track.shoulderWidth;

    expect([...kinds].sort()).toEqual(["guard-rail", "house", "palm", "pine", "rock", "sign"]);
    for (const item of track.scenery) {
      expect(nearestCentreline(track, track.pointAt(item.distance, item.offset))).toBeGreaterThanOrEqual(edge - 0.1);
    }
  });

  it("puts obstacles on the shoulders, and fallen rocks on the road near hairpins", () => {
    const kinds = new Set(track.obstacles.map((obstacle) => obstacle.kind));
    const { roadHalfWidth, shoulderWidth } = track;

    expect([...kinds].sort()).toEqual(["fallen-rock", "post", "rock", "sign"]);
    for (const obstacle of track.obstacles) {
      expect(obstacle.distance).toBeGreaterThan(track.startDistance + 200);
      expect(obstacle.distance).toBeLessThan(track.finishDistance);
      expect(obstacle.radius).toBeGreaterThan(0);
      if (obstacle.kind === "fallen-rock") {
        expect(Math.abs(obstacle.offset)).toBeLessThanOrEqual(roadHalfWidth);
        expect(tightestRadius(track, obstacle.distance - 150, obstacle.distance + 150)).toBeLessThanOrEqual(30);
      } else {
        expect(Math.abs(obstacle.offset)).toBeGreaterThan(roadHalfWidth);
        expect(Math.abs(obstacle.offset)).toBeLessThanOrEqual(roadHalfWidth + shoulderWidth);
      }
    }
  });

  it("lists its scenery and obstacles in order along the track", () => {
    for (const list of [track.scenery, track.obstacles]) {
      const distances = list.map((item) => item.distance);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    }
  });

  it("is the same road in every race, whatever the race's seed", () => {
    const other = createRace({ seed: 987_654 }).track;

    expect(other.finishDistance).toBe(track.finishDistance);
    for (const distance of [0, 1000, 3333.3, track.length]) {
      expect(other.sampleAt(distance)).toEqual(track.sampleAt(distance));
    }
  });

  it("starts the player on the start line, in the lanes that run in the race direction", () => {
    const race = createRace({ seed: 1 });
    const { distance, offset } = race.snapshot().riders[PLAYER];

    expect(distance).toBe(race.track.startDistance);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(race.track.roadHalfWidth);
  });
});
