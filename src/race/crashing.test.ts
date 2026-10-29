import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type RaceEvent, type RiderSnapshot } from ".";
import {
  alongsideARacer,
  chase,
  eventsDuring,
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

/** A started race in which the player has crashed by riding into a rider, and has just got up on foot. */
function playerOnFoot() {
  const race = startedRace();
  const target = nearestOpponent(race);
  eventsUntil(race, chase(race, target, 12), isCrash);
  secondsUntil(race, NO_INPUT, () => player(race).crash === "on-foot", 2);
  return race;
}

describe("on foot, the player", () => {
  /** Angle (radians, clockwise in track space) from the way to the bike to the way the player ran during one step with `input`. */
  function turnWith(input: PlayerInput) {
    const race = playerOnFoot();
    const before = player(race);
    race.step(input);
    const after = player(race);
    const toBike = Math.atan2(before.bike.offset - before.offset, before.bike.distance - before.distance);
    const ran = Math.atan2(after.offset - before.offset, after.distance - before.distance);
    return { turn: Math.atan2(Math.sin(ran - toBike), Math.cos(ran - toBike)), ran: Math.hypot(after.offset - before.offset, after.distance - before.distance) };
  }

  it("runs straight back to the bike when left alone", () => {
    expect(turnWith(NO_INPUT).turn).toBeCloseTo(0, 6);
  });

  it("turns away from running straight at the bike when steering, to either side", () => {
    expect(turnWith({ ...NO_INPUT, steer: 1 }).turn).toBeGreaterThan(0.5);
    expect(turnWith({ ...NO_INPUT, steer: -1 }).turn).toBeLessThan(-0.5);
  });

  it("stops when braking", () => {
    expect(turnWith({ ...NO_INPUT, brake: 1 }).ran).toBe(0);
    expect(turnWith({ ...NO_INPUT, throttle: 1 }).ran).toBeGreaterThan(0.05);
  });

  it("can't attack", () => {
    const race = playerOnFoot();
    race.step({ ...NO_INPUT, punch: true });
    race.step({ ...NO_INPUT, kick: true });

    expect(race.drainEvents().filter((event) => event.type === "attack-thrown")).toEqual([]);
  });
});

/** What a crash at `impactSpeed` (m/s) takes off a bike's condition, by the spec's rule: 6 + 0.15 x the impact speed in km/h. */
const conditionLost = (impactSpeed: number) => 6 + 0.15 * impactSpeed * 3.6;

describe("a bike's condition", () => {
  it("starts full and drops with every crash by 6 + 0.15 x the impact speed in km/h", () => {
    const race = startedRace();
    expect(race.snapshot().riders.map((rider) => rider.condition)).toEqual(Array(15).fill(100));
    const target = nearestOpponent(race);

    const crash = eventsUntil(race, chase(race, target, 12), isCrash).find(isCrash);

    expect(crash?.rider).toBe(PLAYER);
    expect(player(race).condition).toBeCloseTo(100 - conditionLost(crash?.impactSpeed ?? NaN), 9);
  });

  it("drops for a rider knocked off, too", () => {
    const { race, target, events } = racerKnockedOff();
    const crash = events.find(isCrash);

    expect(race.snapshot().riders[target].condition).toBeCloseTo(100 - conditionLost(crash?.impactSpeed ?? NaN), 9);
  });

  it("takes a wrecked opponent out of the race for good, with no position", () => {
    const alongside = alongsideARacer();
    const { race, target } = alongside;
    const punching = () => ({ ...alongside.input(), punch: true });

    const events = eventsUntil(race, punching, (event) => event.type === "wrecked", 120);

    expect(events.filter(isCrash).filter((crash) => crash.rider === target).length).toBeGreaterThan(1);
    expect(events.filter((event) => event.type === "wrecked")).toEqual([{ type: "wrecked", rider: target }]);
    expect(race.snapshot().riders[target]).toMatchObject({ status: "wrecked", position: null, condition: 0 });
    const positions = race.snapshot().riders.map((rider) => rider.position);
    expect(positions.filter((position) => position !== null).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);

    const later = eventsDuring(race, 20, NO_INPUT);

    expect(later.filter((event) => "rider" in event && event.rider === target)).toEqual([]);
    expect(race.snapshot().riders[target]).toMatchObject({ status: "wrecked", position: null });
    expect(race.snapshot().riders[target].crash).not.toBeNull();
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
