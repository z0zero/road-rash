import { describe, expect, it } from "vitest";
import { PLAYER, STEP_SECONDS, type CarSnapshot } from ".";
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

  it("fills a window around the player, from 150 m behind them to 600 m ahead, with about one car per 120 m in each direction", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const counts = { oncoming: [] as number[], raceDirection: [] as number[] };
    const gaps: number[] = [];

    for (let step = 0; step < 150 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const { traffic, riders } = race.snapshot();
      for (const car of traffic) gaps.push(car.distance - riders[PLAYER].distance);
      // Once the player is under way: their own speed brings the cars in the race direction into the window.
      if (step % STEPS_PER_SECOND === 0 && step >= 20 * STEPS_PER_SECOND) {
        counts.oncoming.push(traffic.filter((car) => car.oncoming).length);
        counts.raceDirection.push(traffic.filter((car) => !car.oncoming).length);
      }
    }

    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-150 - 1e-6);
    expect(Math.min(...gaps)).toBeLessThan(-140);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(600 + 1e-6);
    expect(Math.max(...gaps)).toBeGreaterThan(590);
    // 750 m of road at one car per 120 m: about six cars in each direction.
    const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length;
    for (const direction of [counts.oncoming, counts.raceDirection]) {
      expect(mean(direction)).toBeGreaterThan(5);
      expect(mean(direction)).toBeLessThan(7.5);
    }
  });

  it("keeps to its lanes, though some cars change lanes now and then, and never runs into itself", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const lanes = race.track.laneWidth;
    /** The lanes each car has been seen in: 1 and 2 for the lanes right of the centreline, -1 and -2 for those left of it. */
    const seenIn = new Map<number, Set<number>>();
    let overlaps = 0;

    for (let step = 0; step < 150 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const { traffic } = race.snapshot();
      for (const car of traffic) {
        const lane = Math.sign(car.offset) * Math.ceil(Math.abs(car.offset) / lanes);
        // In a lane: its whole width between that lane's lines.
        const inLane = Math.abs(Math.abs(car.offset) - (Math.abs(lane) - 0.5) * lanes) <= (lanes - car.width) / 2;
        if (inLane) seenIn.set(car.id, (seenIn.get(car.id) ?? new Set()).add(lane));
      }
      for (const a of traffic) {
        for (const b of traffic) {
          const touching =
            Math.abs(a.distance - b.distance) < (a.length + b.length) / 2 && Math.abs(a.offset - b.offset) < (a.width + b.width) / 2;
          if (a.id < b.id && touching) overlaps++;
        }
      }
    }

    const changedLanes = [...seenIn.values()].filter((lanesSeen) => lanesSeen.size > 1).length;
    expect(seenIn.size).toBeGreaterThan(40);
    expect(changedLanes).toBeGreaterThanOrEqual(3);
    expect(changedLanes).toBeLessThan(seenIn.size / 2);
    expect(overlaps).toBe(0);
  });
});
