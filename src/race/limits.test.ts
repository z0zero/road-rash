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
  type Race,
} from ".";
import { autopilot, kmh, startedRace, STEPS_PER_SECOND } from "./test-helpers";

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

  /** The most cars on the road at once over `seconds` of riding with `input`. */
  function mostCarsWhile(race: Race, input: () => typeof NO_INPUT, seconds: number) {
    let most = 0;
    for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
      race.step(input());
      most = Math.max(most, race.snapshot().traffic.length);
    }
    return most;
  }

  it("are the most cars the road ever holds at once, whether the player rides flat out or stands still", () => {
    const flatOut = startedRace(1, { cops: false });
    const standingStill = startedRace(2, { cops: false });

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
