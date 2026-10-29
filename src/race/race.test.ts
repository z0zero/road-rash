import { describe, expect, it } from "vitest";
import { createRace, NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race } from ".";

const STEPS_PER_SECOND = 60;
const FULL_THROTTLE: PlayerInput = { ...NO_INPUT, throttle: 1 };

function kmh(value: number) {
  return value / 3.6;
}

function stepFor(race: Race, seconds: number, input: PlayerInput = NO_INPUT) {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let i = 0; i < steps; i++) race.step(input);
}

/** A race whose countdown has just run out. */
function startedRace(seed = 1) {
  const race = createRace({ seed });
  stepFor(race, 3);
  race.drainEvents();
  return race;
}

function player(race: Race) {
  return race.snapshot().riders[PLAYER];
}

/** Steps with `input` until `done` holds, and returns how many seconds that took. */
function secondsUntil(race: Race, input: PlayerInput, done: () => boolean, limitSeconds = 120) {
  let steps = 0;
  while (!done()) {
    if (steps >= limitSeconds * STEPS_PER_SECOND) throw new Error(`not done within ${limitSeconds} s`);
    race.step(input);
    steps++;
  }
  return steps * STEP_SECONDS;
}

describe("the countdown", () => {
  it("lasts three seconds, then the race starts", () => {
    const race = createRace({ seed: 1 });
    expect(race.snapshot().countdown).toBe(3);

    stepFor(race, 3 - STEP_SECONDS);
    expect(race.snapshot().countdown).toBeGreaterThan(0);
    expect(race.drainEvents()).toEqual([]);

    race.step(NO_INPUT);
    expect(race.snapshot().countdown).toBe(0);
    expect(race.drainEvents()).toEqual([{ type: "race-started" }]);
  });

  it("holds the player on the start line, even under full throttle", () => {
    const race = createRace({ seed: 1 });
    const before = race.snapshot().riders[PLAYER];

    stepFor(race, 2.5, { ...NO_INPUT, throttle: 1, steer: 1 });

    const after = race.snapshot().riders[PLAYER];
    expect(after.speed).toBe(0);
    expect(after.distance).toBe(before.distance);
    expect(after.offset).toBe(before.offset);
  });
});

describe("riding", () => {
  it("takes the bike from 0 to 100 km/h in about 3.5 seconds under full throttle", () => {
    const race = startedRace();

    const seconds = secondsUntil(race, FULL_THROTTLE, () => player(race).speed >= kmh(100));

    expect(seconds).toBeGreaterThan(3.2);
    expect(seconds).toBeLessThan(3.8);
  });

  it("reaches a top speed of 225 km/h and never goes faster", () => {
    const race = startedRace();
    let fastest = 0;

    for (let i = 0; i < 30 * STEPS_PER_SECOND; i++) {
      race.step(FULL_THROTTLE);
      fastest = Math.max(fastest, player(race).speed);
    }

    expect(fastest).toBeCloseTo(kmh(225), 6);
    expect(fastest).toBeLessThanOrEqual(kmh(225) + 1e-9);
  });

  it("brakes at about 12 m/s²", () => {
    const race = startedRace();
    secondsUntil(race, FULL_THROTTLE, () => player(race).speed >= 40);
    const before = player(race).speed;

    stepFor(race, 1, { ...NO_INPUT, brake: 1 });

    expect(before - player(race).speed).toBeGreaterThan(11);
    expect(before - player(race).speed).toBeLessThan(13.5);
  });

  it("slows gently when coasting", () => {
    const race = startedRace();
    secondsUntil(race, FULL_THROTTLE, () => player(race).speed >= 40);
    const before = player(race).speed;

    stepFor(race, 1, NO_INPUT);

    const loss = before - player(race).speed;
    expect(loss).toBeGreaterThan(0.2);
    expect(loss).toBeLessThan(2);
  });

  /**
   * How fast full right steering moves the bike sideways at a speed: the
   * difference between a race that steers and an identical one that doesn't.
   */
  function sidewaysSpeedFromSteering(speed: number) {
    const steering = startedRace();
    const straight = startedRace();
    const steps = Math.round(secondsUntil(steering, FULL_THROTTLE, () => player(steering).speed >= speed) / STEP_SECONDS);
    for (let i = 0; i < steps; i++) straight.step(FULL_THROTTLE);

    stepFor(steering, 0.5, { ...NO_INPUT, steer: 1 });
    stepFor(straight, 0.5, NO_INPUT);
    const gapBefore = player(steering).offset - player(straight).offset;
    steering.step({ ...NO_INPUT, steer: 1 });
    straight.step(NO_INPUT);
    const gapAfter = player(steering).offset - player(straight).offset;

    return (gapAfter - gapBefore) / STEP_SECONDS;
  }

  it("steers sideways at up to about 8 m/s at low speed", () => {
    const sideways = sidewaysSpeedFromSteering(10);

    expect(sideways).toBeGreaterThan(7);
    expect(sideways).toBeLessThan(8.5);
  });

  it("steers sideways more slowly at high speed", () => {
    expect(sidewaysSpeedFromSteering(45)).toBeLessThan(sidewaysSpeedFromSteering(10) - 1);
  });
});
