import { describe, expect, it } from "vitest";
import { STEP_SECONDS, type CarSnapshot } from ".";
import { autopilot, player, startedRace, STEPS_PER_SECOND } from "./test-helpers";

describe("traffic", () => {
  it("drives in the race direction in the right lanes at 15 to 25 m/s, and oncoming in the left lanes at 18 to 28 m/s", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const { roadHalfWidth } = race.track;
    const seen = { oncoming: 0, raceDirection: 0 };
    let before: readonly CarSnapshot[] = race.snapshot().traffic;

    for (let step = 0; step < 60 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const after = race.snapshot().traffic;
      for (const car of after) {
        const was = before.find((other) => other.id === car.id);
        if (!was) continue;
        // Along the track, metres per second in the race direction.
        const moved = (car.distance - was.distance) / STEP_SECONDS;
        if (car.oncoming) {
          seen.oncoming++;
          expect(car.offset + car.width / 2).toBeLessThanOrEqual(0);
          expect(car.offset - car.width / 2).toBeGreaterThanOrEqual(-roadHalfWidth);
          expect(-moved).toBeGreaterThanOrEqual(18 - 1e-9);
          expect(-moved).toBeLessThanOrEqual(28 + 1e-9);
          expect(car.speed).toBeCloseTo(-moved, 6);
        } else {
          seen.raceDirection++;
          expect(car.offset - car.width / 2).toBeGreaterThanOrEqual(0);
          expect(car.offset + car.width / 2).toBeLessThanOrEqual(roadHalfWidth);
          expect(moved).toBeGreaterThanOrEqual(15 - 1e-9);
          expect(moved).toBeLessThanOrEqual(25 + 1e-9);
          expect(car.speed).toBeCloseTo(moved, 6);
        }
      }
      before = after;
    }

    expect(seen.oncoming).toBeGreaterThan(1000);
    expect(seen.raceDirection).toBeGreaterThan(1000);
    expect(player(race).distance).toBeGreaterThan(race.track.startDistance + 1000);
  });
});
