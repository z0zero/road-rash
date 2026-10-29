import { describe, expect, it } from "vitest";
import { PLAYER, STEP_SECONDS, type CarSnapshot, type Race } from ".";
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

  it("stays off a closed road", () => {
    const race = startedRace(1, { traffic: false });
    const pilot = autopilot(race);

    for (let step = 0; step < 60 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      expect(race.snapshot().traffic).toEqual([]);
    }
    expect(player(race).distance).toBeGreaterThan(race.track.startDistance + 1000);
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

/** A car or an obstacle, as something on the road a rider can run into: its middle, and half its length and width (metres). */
interface Thing {
  readonly key: string;
  readonly distance: number;
  readonly offset: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

function thingsOn(race: Race): Thing[] {
  return [
    ...race.snapshot().traffic.map((car) => ({
      key: `car ${car.id}`,
      distance: car.distance,
      offset: car.offset,
      halfLength: car.length / 2,
      halfWidth: car.width / 2,
    })),
    ...race.track.obstacles.map((obstacle, index) => ({
      key: `obstacle ${index}`,
      distance: obstacle.distance,
      offset: obstacle.offset,
      halfLength: obstacle.radius,
      halfWidth: obstacle.radius,
    })),
  ];
}

/** Whether a rider on a bike, about 2 m long and 0.8 m wide, at `rider` touches `thing`. */
function touching(rider: { readonly distance: number; readonly offset: number }, thing: Thing) {
  return Math.abs(thing.distance - rider.distance) < thing.halfLength + 1 && Math.abs(thing.offset - rider.offset) < thing.halfWidth + 0.4;
}

describe("opponents", () => {
  it("steer around the cars and obstacles in their way, nearly always without touching them", () => {
    let inTheWay = 0;
    let touched = 0;
    for (const seed of [1, 2]) {
      const race = startedRace(seed);
      const pilot = autopilot(race);
      /** For each opponent coming up to a car or obstacle in its path, whether it has touched it yet. */
      const comingUp = new Map<string, boolean>();
      for (let step = 0; step < 180 * STEPS_PER_SECOND && player(race).status === "racing"; step++) {
        race.step(pilot());
        const things = thingsOn(race);
        for (const rider of race.snapshot().riders) {
          if (rider.id === PLAYER || rider.status !== "racing" || rider.crash !== null) continue;
          for (const thing of things) {
            const key = `${rider.id}: ${thing.key}`;
            const ahead = thing.distance - rider.distance;
            const inItsPath = Math.abs(thing.offset - rider.offset) < thing.halfWidth + 0.4;
            if (!comingUp.has(key)) {
              if (ahead > 20 && ahead < 60 && inItsPath) comingUp.set(key, false);
            } else if (touching(rider, thing)) {
              comingUp.set(key, true);
            } else if (ahead < -thing.halfLength - 1) {
              inTheWay++;
              if (comingUp.get(key)) touched++;
              comingUp.delete(key);
            }
          }
        }
      }
    }

    expect(inTheWay).toBeGreaterThan(50);
    expect(touched / inTheWay).toBeLessThan(0.1);
  });
});
