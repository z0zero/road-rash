import { describe, expect, it } from "vitest";
import {
  COP_ALERT_RANGE,
  createRace,
  FULL_CONDITION,
  FULL_STAMINA,
  MOST_CARS,
  NO_INPUT,
  QUALIFYING_POSITION,
  TOP_SPEED,
  TRAFFIC_AHEAD,
  TRAFFIC_BEHIND,
  type Race,
} from ".";
import { autopilot, kmh, NO_COPS, startedRace, STEPS_PER_SECOND, WHOLE_RACES } from "./test-helpers";

describe("the race's limits, which the game shows", () => {
  it("are a bike's top speed: 225 km/h", () => {
    expect(TOP_SPEED).toBeCloseTo(kmh(225), 9);
  });

  it("are a fresh rider's stamina and a perfect bike's condition: 100 each, as every rider starts the race", () => {
    expect(FULL_STAMINA).toBe(100);
    expect(FULL_CONDITION).toBe(100);
    for (const rider of createRace({ seed: 1 }).snapshot().riders) {
      expect(rider).toMatchObject({ stamina: FULL_STAMINA, condition: FULL_CONDITION });
    }
  });

  it("are the position a player must finish in, or better, to qualify: third", () => {
    expect(QUALIFYING_POSITION).toBe(3);
  });

  it("are how near the player a cop sets off the cop alert: 150 m", () => {
    expect(COP_ALERT_RANGE).toBe(150);
  });

  it("are how far ahead of the player cars come onto the road, and leave it: 600 m", () => {
    expect(TRAFFIC_AHEAD).toBe(600);
    const race = startedRace(1, NO_COPS);
    const pilot = autopilot(race);
    let furthest = 0;
    for (let step = 0; step < 60 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const { riders, traffic } = race.snapshot();
      for (const car of traffic) furthest = Math.max(furthest, car.distance - riders[0].distance);
    }

    expect(furthest).toBeGreaterThan(TRAFFIC_AHEAD - 20);
    expect(furthest).toBeLessThanOrEqual(TRAFFIC_AHEAD + 1e-6);
  });

  it("are how far behind the player cars leave the road, and come onto it behind a slower player: 150 m", () => {
    expect(TRAFFIC_BEHIND).toBe(150);
    const race = startedRace(1, NO_COPS);
    const pilot = autopilot(race);
    let furthestBack = 0;
    for (let step = 0; step < 60 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const { riders, traffic } = race.snapshot();
      for (const car of traffic) furthestBack = Math.max(furthestBack, riders[0].distance - car.distance);
    }

    expect(furthestBack).toBeGreaterThan(TRAFFIC_BEHIND - 20);
    expect(furthestBack).toBeLessThanOrEqual(TRAFFIC_BEHIND + 1e-6);
  });

  /** The most cars on the road at once over `seconds` of riding with `input`. */
  function mostCarsWhile(race: Race, input: () => typeof NO_INPUT, seconds: number) {
    let most = 0;
    for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
      race.step(input());
      most = Math.max(most, race.snapshot().traffic.length);
    }
    return most;
  }

  it("are the most cars the road ever holds at once, whether the player rides flat out or stands still", WHOLE_RACES, () => {
    const flatOut = startedRace(1, NO_COPS);
    const standingStill = startedRace(2, NO_COPS);

    const mostFlatOut = mostCarsWhile(flatOut, autopilot(flatOut), 120);
    const mostStandingStill = mostCarsWhile(standingStill, () => ({ ...NO_INPUT, brake: 1 }), 120);

    // The road is busy either way...
    expect(mostFlatOut).toBeGreaterThan(5);
    expect(mostStandingStill).toBeGreaterThan(5);
    // ...but never holds more cars than that.
    expect(mostFlatOut).toBeLessThanOrEqual(MOST_CARS);
    expect(mostStandingStill).toBeLessThanOrEqual(MOST_CARS);
  });
});
