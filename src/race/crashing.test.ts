import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race, type RaceEvent, type RiderSnapshot } from ".";
import {
  alongsideARacer,
  apart,
  autopilot,
  chase,
  CLOSED_ROAD,
  eventsDuring,
  eventsUntil,
  FULL_THROTTLE,
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

/**
 * A race with no cops, on a road closed to every car but `cars` and a saloon
 * driving the race's way in the right-hand lane at 12 m/s, in which the field
 * has ridden off for 10 s and the player has then ridden into the back of the
 * saloon at 22 m/s, lined up 1.1 m right of its middle: it drives on, away
 * from their bike, which slides to a stop out on the road, clear of
 * everything.
 */
function crashedIntoTheBackOfACar(cars: readonly TestCar[] = []) {
  const { track } = setUpRace({ seed: 1 }, CLOSED_ROAD);
  const ahead = { distance: track.startDistance + 100, offset: track.laneWidth / 2, speed: 12 };
  const race = startedRace(1, { ...NO_COPS, traffic: { cars: [...cars, ahead] } });
  stepFor(race, 10);
  const events = eventsUntil(race, rideInto(race, { distance: 0, offset: ahead.offset + 1.1 }, 22), playerCrashed, 60);
  expect(events.filter(playerCrashed).map((event) => event.cause)).toEqual(["traffic"]);
  return race;
}

/**
 * The race of `crashedIntoTheBackOfACar` with a car coming down the road
 * towards the player at 25 m/s, its middle `across` metres right of their
 * bike's, so that it is about a quarter of a second from running into the
 * bike, ridden off at 5 m/s, as the player reaches it; one `changingLanes`
 * has started a tenth of a second before to move across into the line of the
 * bike's middle.
 */
function reachingTheirBikeOnTheRoadAsACarComes(across: number, { changingLanes = false } = {}) {
  const { steps, bike } = backOnTheirBike(crashedIntoTheBackOfACar());
  // A saloon's middle is 2.3 m from its front, a bike's 1 m from its.
  const meeting = bike.distance + 3.3 + 0.25 * (25 + 5);
  const laneChange = changingLanes ? { laneChange: { to: bike.offset, after: steps / STEPS_PER_SECOND - 0.1 } } : {};
  const car = { distance: meeting + (25 * steps) / STEPS_PER_SECOND, offset: bike.offset + across, speed: 25, oncoming: true, ...laneChange };
  return crashedIntoTheBackOfACar([car]);
}

/**
 * A race on a road closed to every car but `cars` and a saloon standing still
 * in the right-hand lane 60 m past where the first cop waits, in which the
 * player has ridden past the cop, which joins the race behind them, and into
 * the back of the saloon at `speed` m/s, lined up 1.1 m right of its middle:
 * their bike stops behind its corner, they land behind it, and the cop rides
 * to bust them.
 */
function crashedJustPastTheFirstCop(speed: number, cars: readonly TestCar[] = []) {
  const placed = setUpRace({ seed: 1 }, CLOSED_ROAD);
  const waitingAt = placed.snapshot().cops[0].distance;
  const parked = { distance: waitingAt + 60, offset: placed.track.laneWidth / 2 };
  const corner = { distance: parked.distance, offset: parked.offset + 1.1 };
  const race = leftOnTheirOwn(1, { traffic: { cars: [...cars, parked] } });
  secondsUntil(race, autopilot(race, { lane: corner.offset }), () => player(race).distance >= waitingAt - 40, 200);
  const events = eventsUntil(race, rideInto(race, corner, speed), playerCrashed, 60);
  expect(events.filter(playerCrashed).map((event) => event.cause)).toEqual(["traffic"]);
  expect(race.snapshot().cops[0].busting).toBe(PLAYER);
  return race;
}

/**
 * The race of `crashedJustPastTheFirstCop` with a car coming down the road
 * towards the player at 25 m/s, its middle 1 m right of their bike's, clear
 * of the saloon, so that it is about `seconds` from running into the bike,
 * ridden off at 5 m/s, as the player reaches it.
 */
function reachingTheirBikeAsTheCopAndACarCome(speed: number, seconds: number) {
  const { steps, bike } = backOnTheirBike(crashedJustPastTheFirstCop(speed));
  // A saloon's middle is 2.3 m from its front, a bike's 1 m from its.
  const meeting = bike.distance + 3.3 + seconds * (25 + 5);
  const car = { distance: meeting + (25 * steps) / STEPS_PER_SECOND, offset: bike.offset + 1, speed: 25, oncoming: true };
  return crashedJustPastTheFirstCop(speed, [car]);
}

/**
 * Watches the first cop as the player gets back on in `race`: how far it was
 * from them as they reached their bike, and how many seconds they waited by
 * it for a car with the cop within 10.5 m of them.
 */
function watchingTheCop(race: Race) {
  const cop = () => race.snapshot().cops[0];
  const seen = { asTheyReachedIt: NaN, waitedWithItClose: 0 };
  const watching = () => {
    const me = player(race);
    if (Number.isNaN(seen.asTheyReachedIt) && (me.waitingForACar || me.crash === null)) seen.asTheyReachedIt = apart(cop(), me);
    if (me.waitingForACar && apart(cop(), me) <= 10.5) seen.waitedWithItClose += 1 / STEPS_PER_SECOND;
  };
  return { seen, watching };
}

/**
 * Steps `race` with no input until the player gets back on their bike, within
 * 10 s, calling `watching` after every step, and returns every event emitted
 * on the way; how long they waited by their bike for a car; and, as they
 * reached it, how far the first car's side was from the bike's, and how far
 * its front was from the bike's, which it was coming at.
 */
function gettingBackOn(race: Race, watching = () => {}) {
  const events: RaceEvent[] = [];
  let waited = 0;
  let reached: { clear: number; ahead: number } | null = null;
  for (let step = 0; step < 10 * STEPS_PER_SECOND && !events.some((event) => event.type === "remounted"); step++) {
    race.step(NO_INPUT);
    events.push(...race.drainEvents());
    watching();
    const me = player(race);
    if (me.waitingForACar) waited++;
    if (!reached && (me.waitingForACar || me.crash === null)) {
      const car = race.snapshot().traffic[0];
      // A bike is 0.8 m wide and 2 m long.
      reached = { clear: Math.abs(car.offset - me.bike.offset) - car.width / 2 - 0.4, ahead: car.distance - car.length / 2 - (me.bike.distance + 1) };
    }
  }
  return { events, waited: waited / STEPS_PER_SECOND, reached };
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

  it("waits for a car that would pass just clear of the bike's side too, which drifting towards it as they rode off would run them into", () => {
    // A saloon is 1.8 m wide: this one comes on the bike's right, its side 0.05 m clear of the bike's.
    const race = reachingTheirBikeOnTheRoadAsACarComes(1.35);

    const { events, waited, reached } = gettingBackOn(race);
    const gotOnAt = player(race).distance;
    const carAt = race.snapshot().traffic[0].distance;
    // Drifting right as they ride off, at a fifth of full steering.
    events.push(...eventsDuring(race, 2, { ...NO_INPUT, throttle: 1, steer: 0.2 }));

    expect(reached?.clear).toBeCloseTo(0.05, 6);
    // Closing in at 30 m/s on the bike ridden off at 5, it would reach it within the half second a rider looks ahead.
    expect(reached?.ahead).toBeGreaterThan(0);
    expect(reached?.ahead).toBeLessThan(30 * 0.5);
    expect(events.filter((event) => event.type === "crash" || event.type === "knocked-down")).toEqual([]);
    expect(waited).toBeGreaterThan(0.2);
    expect(waited).toBeLessThan(1);
    expect(carAt).toBeLessThan(gotOnAt);
  });

  it("waits for a car changing lanes into the bike's way, counting the lane it is moving to as well as where it is", () => {
    // A saloon is 1.8 m wide: this one comes on the bike's right, moving across into the line of the bike's middle at
    // the 1.8 m/s a car changes lanes at, its side still over 0.3 m clear of the bike's as the player reaches it.
    const race = reachingTheirBikeOnTheRoadAsACarComes(2, { changingLanes: true });
    const car = () => race.snapshot().traffic[0];
    // Where the bike lies, or lay until they got back on, and how far right of it the car's middle passed it.
    let lying = player(race).bike;
    let acrossAsItPassed = NaN;
    const watching = () => {
      if (player(race).crash) lying = player(race).bike;
      if (Number.isNaN(acrossAsItPassed) && car().distance <= lying.distance) acrossAsItPassed = car().offset - lying.offset;
    };

    const { events, waited, reached } = gettingBackOn(race, watching);
    const gotOnAt = player(race).distance;
    const carAt = car().distance;
    events.push(...eventsDuring(race, 2, () => (watching(), FULL_THROTTLE)));

    expect(reached?.clear).toBeGreaterThan(0.3);
    expect(reached?.ahead).toBeGreaterThan(0);
    expect(reached?.ahead).toBeLessThan(30 * 0.5);
    // It passed with its middle within a saloon's half-width and a bike's of the bike's: in its way.
    expect(Math.abs(acrossAsItPassed)).toBeLessThan(0.9 + 0.4);
    expect(events.filter((event) => event.type === "crash" || event.type === "knocked-down")).toEqual([]);
    expect(waited).toBeGreaterThan(0.2);
    expect(carAt).toBeLessThan(gotOnAt);
  });

  it("waits on once waiting, even as a cop riding to bust them comes within 10.5 m, as the car is closest then, and gets on once it is by", () => {
    const race = reachingTheirBikeAsTheCopAndACarCome(15, 0.4);
    const { seen, watching } = watchingTheCop(race);

    const { events, reached } = gettingBackOn(race, watching);
    const gotBackOn = events.at(-1);
    events.push(...eventsDuring(race, 2, FULL_THROTTLE));

    // The cop was further off as they reached their bike, and they started to wait.
    expect(seen.asTheyReachedIt).toBeGreaterThan(10.5);
    // The car's way took in 0.3 m of the bike's, and it would reach the bike ridden off within half a second.
    expect(reached?.clear).toBeCloseTo(-0.3, 6);
    expect(reached?.ahead).toBeGreaterThan(0);
    expect(reached?.ahead).toBeLessThan(30 * 0.5);
    expect(seen.waitedWithItClose).toBeGreaterThan(0.2);
    expect(gotBackOn).toEqual({ type: "remounted", rider: PLAYER });
    expect(events.filter((event) => ["crash", "knocked-down", "busted"].includes(event.type))).toEqual([]);
  });

  it("doesn't wait with a cop riding to bust them within 10.5 m as they reach their bike, but gets on, chancing the car rather than the cop", () => {
    const race = reachingTheirBikeAsTheCopAndACarCome(12, 0.4);
    const { seen, watching } = watchingTheCop(race);

    const { events, waited, reached } = gettingBackOn(race, watching);

    expect(seen.asTheyReachedIt).toBeLessThan(10.5);
    expect(reached?.clear).toBeCloseTo(-0.3, 6);
    expect(reached?.ahead).toBeGreaterThan(0);
    expect(reached?.ahead).toBeLessThan(30 * 0.5);
    expect(waited).toBe(0);
    expect(events.filter((event) => event.type === "busted")).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "remounted", rider: PLAYER });
  });
});
