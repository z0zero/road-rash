import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race, type RaceEvent, type RiderSnapshot } from ".";
import {
  alongsideARacer,
  chase,
  CLOSED_ROAD,
  eventsDuring,
  eventsUntil,
  isCrash,
  kmh,
  leftOnTheirOwn,
  nearestOpponent,
  NO_COPS,
  player,
  playerCrashed,
  racerKnockedOff,
  rideInto,
  secondsUntil,
  setUpRace,
  startedRace,
  stepFor,
  STEPS_PER_SECOND,
} from "./test-helpers";
import type { TestCar } from "./traffic";


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

  it("can be set up worn for a test, for the player only", () => {
    const { riders } = setUpRace({ seed: 1 }, { playerCondition: 30 }).snapshot();

    expect(riders.map((rider) => rider.condition)).toEqual([30, ...Array(14).fill(100)]);
  });

  it("ends the player's race as Wrecked when it runs out", () => {
    // A bike with 20 condition left, ridden into another rider twice: the first crash leaves a little, the second wrecks it.
    const race = setUpRace({ seed: 1 }, { playerCondition: 20 });
    stepFor(race, 3);
    const target = nearestOpponent(race);

    const events = eventsUntil(race, chase(race, target, 12), (event) => event.type === "player-race-over", 300);

    const crashes = events.filter(isCrash).filter((crash) => crash.rider === PLAYER);
    const lost = crashes.map(({ impactSpeed }) => conditionLost(impactSpeed));
    expect(crashes).toHaveLength(2);
    expect(lost[0]).toBeLessThan(20);
    expect(lost[0] + lost[1]).toBeGreaterThanOrEqual(20);
    const aboutThePlayer = events.filter(
      (event) => event.type === "player-race-over" || ("rider" in event && event.rider === PLAYER),
    );
    expect(aboutThePlayer.slice(-3)).toEqual([
      crashes.at(-1),
      { type: "wrecked", rider: PLAYER },
      { type: "player-race-over", outcome: "wrecked" },
    ]);
    expect(player(race)).toMatchObject({ status: "wrecked", condition: 0, position: null });

    const results = race.fastForward();

    expect(results).toMatchObject({ outcome: "wrecked", position: null, time: null, qualified: false });
    expect(results.standings).toContainEqual({ rider: PLAYER, name: "You", status: "wrecked", position: null, time: null });
    const firstUnplaced = results.standings.findIndex((standing) => standing.position === null);
    expect(results.standings.slice(firstUnplaced).every((standing) => standing.position === null)).toBe(true);
  });

  it("takes a wrecked opponent out of the race for good, with no position", () => {
    // With no cops about: a cop near the player would bust the racer long before its bike was wrecked.
    const alongside = alongsideARacer(1, NO_COPS);
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

/**
 * A race with no cops, on a road closed to every car but `cars`, in which the
 * field has ridden off and the player has ridden into the first roadside sign
 * at least 100 m ahead of their start line at about 15 m/s: their bike stops
 * against it, they are thrown on past it, and they are about to get up.
 */
function crashedIntoTheFirstSign(cars: readonly TestCar[] = []) {
  const { track } = setUpRace({ seed: 1 }, CLOSED_ROAD);
  const sign = track.obstacles.find((obstacle) => obstacle.kind === "sign" && obstacle.distance > track.startDistance + 100);
  if (!sign) throw new Error("no sign near the start");
  const race = leftOnTheirOwn(1, { ...NO_COPS, traffic: { cars } });
  eventsUntil(race, rideInto(race, sign, 15), playerCrashed, 60);
  return race;
}

/** Steps `race` with no input until the player gets back on their bike, and returns how many steps the race has taken by then, the countdown's too, and where their bike is. */
function backOnTheirBike(race: Race) {
  eventsUntil(race, NO_INPUT, (event) => event.type === "remounted", 10);
  const { clock, riders } = race.snapshot();
  return { steps: Math.round((3 + clock) * STEPS_PER_SECOND), bike: riders[PLAYER].bike };
}

/**
 * The race of `crashedIntoTheFirstSign` with `count` cars, `apart` metres
 * from middle to middle, coming down the road towards the riders at `speed`
 * m/s, `across` metres right of the line of the player's bike, so that the
 * first is about a quarter of a second from running into the bike, ridden
 * off at 5 m/s, as the player reaches it.
 */
function reachingTheirBikeAsCarsCome(speed: number, { count = 1, apart = 0, across = 0 } = {}) {
  const { steps, bike } = backOnTheirBike(crashedIntoTheFirstSign());
  // A saloon's middle is 2.3 m from its front, a bike's 1 m from its.
  const first = bike.distance + 3.3 + 0.25 * (speed + 5) + (speed * steps) / STEPS_PER_SECOND;
  const cars = Array.from({ length: count }, (_, k) => ({ distance: first + k * apart, offset: bike.offset + across, speed, oncoming: true }));
  return crashedIntoTheFirstSign(cars);
}

describe("getting back on as a car comes", () => {
  it("waits by the bike, out of the car's way, until it has gone by, then gets on and rides off", () => {
    const race = reachingTheirBikeAsCarsCome(25);
    const car = () => race.snapshot().traffic[0];
    const events: RaceEvent[] = [];
    let waited = 0;
    let touchedIt = false;
    for (let step = 0; step < 10 * STEPS_PER_SECOND && !events.some((event) => event.type === "remounted"); step++) {
      race.step(NO_INPUT);
      events.push(...race.drainEvents());
      const me = player(race);
      if (!me.waitingForACar) continue;
      waited++;
      expect(me.crash).toBe("on-foot");
      // A rider on foot takes up about 0.6 m either way.
      const along = Math.abs(car().distance - me.distance) - car().length / 2 - 0.3;
      const across = Math.abs(car().offset - me.offset) - car().width / 2 - 0.3;
      if (along < 0 && across < 0) touchedIt = true;
    }
    const gotOnAt = player(race).distance;
    const carAt = car().distance;
    events.push(...eventsDuring(race, 3, { ...NO_INPUT, throttle: 1 }));

    expect(events.filter((event) => event.type === "crash" || event.type === "knocked-down")).toEqual([]);
    expect(carAt).toBeLessThan(gotOnAt);
    expect(waited / STEPS_PER_SECOND).toBeGreaterThan(0.2);
    expect(waited / STEPS_PER_SECOND).toBeLessThan(1);
    expect(touchedIt).toBe(false);
    expect(player(race).speed).toBeGreaterThan(kmh(30));
  });

  it("waits three seconds at most, however long the cars keep coming, then gets on", () => {
    // A queue crawling along nose to tail, each car fast enough to crash a rider riding off towards it, and each
    // brushing the bike's side, as it comes along the shoulder's far edge, beside the player's way back to the bike.
    const race = reachingTheirBikeAsCarsCome(3, { count: 6, apart: 9, across: 1.2 });
    let waited = 0;
    eventsUntil(race, () => (player(race).waitingForACar && waited++, NO_INPUT), (event) => event.type === "remounted", 10);

    expect(waited / STEPS_PER_SECOND).toBeCloseTo(3, 1);
  });

  it("doesn't wait for a car standing still at the bike, which they would only bump, but gets back on as soon as they reach it", () => {
    const { track } = setUpRace({ seed: 1 }, CLOSED_ROAD);
    const parked = { distance: track.startDistance + 100, offset: track.laneWidth / 2 };
    const race = leftOnTheirOwn(1, { ...NO_COPS, traffic: { cars: [parked] } });
    eventsUntil(race, rideInto(race, parked, 15), playerCrashed, 60);
    secondsUntil(race, NO_INPUT, () => player(race).crash === "on-foot", 2);
    const reach = (me: RiderSnapshot) => Math.hypot(me.bike.distance - me.distance, me.bike.offset - me.offset);
    // Their bike has stopped against the car's back: its middle is 1 m from its front, a saloon's 2.3 m from its back.
    expect(player(race).bike.distance + 1 + 0.05 + 2.3).toBeCloseTo(parked.distance, 6);

    const runningBack = reach(player(race)) / 6;
    const seconds = secondsUntil(race, NO_INPUT, () => {
      expect(player(race).waitingForACar).toBe(false);
      return player(race).crash === null;
    }, 3);

    expect(seconds).toBeLessThan(runningBack + 0.1);
  });
});
