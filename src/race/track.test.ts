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

  it("starts the player on the start line", () => {
    const race = createRace({ seed: 1 });

    expect(race.snapshot().riders[PLAYER].distance).toBe(race.track.startDistance);
  });
});
