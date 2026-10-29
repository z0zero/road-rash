import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type RaceEvent, type RiderSnapshot } from ".";
import {
  chase,
  eventsUntil,
  kmh,
  nearestOpponent,
  player,
  racerKnockedOff,
  secondsUntil,
  startedRace,
} from "./test-helpers";

type Crash = Extract<RaceEvent, { type: "crash" }>;
const isCrash = (event: RaceEvent): event is Crash => event.type === "crash";

describe("after a crash", () => {
  it("the rider tumbles for about 1.2 s, then is on foot, running back to their bike at about 6 m/s", () => {
    const { race, target } = racerKnockedOff();
    const them = () => race.snapshot().riders[target];

    const tumbling = secondsUntil(race, NO_INPUT, () => them().crash !== "tumbling", 3);

    expect(tumbling).toBeGreaterThan(1.1);
    expect(tumbling).toBeLessThan(1.3);
    expect(them().crash).toBe("on-foot");
    const gap = (rider: RiderSnapshot) => Math.hypot(rider.bike.distance - rider.distance, rider.bike.offset - rider.offset);
    const before = them();
    race.step(NO_INPUT);
    const after = them();
    const run = Math.hypot(after.distance - before.distance, after.offset - before.offset) / STEP_SECONDS;
    expect(run).toBeGreaterThan(5.5);
    expect(run).toBeLessThan(6.5);
    expect(gap(after)).toBeCloseTo(gap(before) - run * STEP_SECONDS, 6);
  });

  it("the rider gets back on when they reach their bike, riding off slowly with at least 50 stamina", () => {
    const { race, target } = racerKnockedOff();
    const them = () => race.snapshot().riders[target];
    expect(them().stamina).toBe(0);

    const events = eventsUntil(race, NO_INPUT, (event) => event.type === "remounted", 10);

    expect(events.at(-1)).toEqual({ type: "remounted", rider: target });
    expect(them().crash).toBeNull();
    expect(them().stamina).toBeCloseTo(50, 0);
    expect(them().speed).toBeGreaterThan(0);
    expect(them().speed).toBeLessThan(kmh(30));
    expect(them().distance).toBe(them().bike.distance);
    expect(them().offset).toBe(them().bike.offset);
  });
});

describe("running into another rider", () => {
  it("crashes the faster rider when the speed difference is above 8 m/s, and only them", () => {
    const race = startedRace();
    const target = nearestOpponent(race);
    const input = chase(race, target, 12);
    let difference = 0;
    const closingIn = () => ((difference = player(race).speed - race.snapshot().riders[target].speed), input());

    const events = eventsUntil(race, closingIn, isCrash);

    expect(events.filter(isCrash)).toEqual([
      { type: "crash", rider: PLAYER, cause: "rider", impactSpeed: expect.closeTo(difference, 0) },
    ]);
    expect(difference).toBeGreaterThan(8);
    expect(player(race).crash).toBe("tumbling");
    expect(race.snapshot().riders[target].crash).toBeNull();
  });
});
