import { describe, expect, it } from "vitest";
import { createRace, NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race, type Track } from ".";
import {
  autopilot,
  FULL_THROTTLE,
  kmh,
  player,
  secondsUntil,
  startedRace,
  stepFor,
  STEPS_PER_SECOND,
} from "./test-helpers";

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

  it("starts the race clock when it runs out", () => {
    const race = createRace({ seed: 1 });
    stepFor(race, 2);
    expect(race.snapshot().clock).toBe(0);

    stepFor(race, 1);
    expect(race.snapshot().clock).toBe(0);

    stepFor(race, 90, FULL_THROTTLE);
    expect(race.snapshot().clock).toBeCloseTo(90, 9);
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
    const pilot = autopilot(race);
    let fastest = 0;

    secondsUntil(race, pilot, () => {
      fastest = Math.max(fastest, player(race).speed);
      return player(race).distance >= race.track.finishDistance;
    });

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

  it("slows the bike sharply off the road, even under full throttle", () => {
    const race = startedRace();
    const { roadHalfWidth } = race.track;
    secondsUntil(race, FULL_THROTTLE, () => player(race).speed >= 40);
    secondsUntil(race, { ...FULL_THROTTLE, steer: 1 }, () => player(race).offset > roadHalfWidth + 0.5);
    const before = player(race).speed;

    stepFor(race, 1, FULL_THROTTLE);

    expect(player(race).offset).toBeGreaterThan(roadHalfWidth);
    expect(before - player(race).speed).toBeGreaterThan(8);
  });

  /** The middle of the first stretch after `from` that curves steadily at a radius between `minRadius` and `maxRadius`. */
  function steadyCurve(track: Track, from: number, minRadius: number, maxRadius: number) {
    for (let d = from; d < track.finishDistance; d++) {
      const curvatures = [-60, -30, 0, 10].map((ahead) => track.sampleAt(d + ahead).curvature);
      const radius = 1 / Math.abs(curvatures[2]);
      const steady = curvatures.every((curvature) => Math.abs(curvature - curvatures[2]) < 1e-9);
      if (steady && radius >= minRadius && radius <= maxRadius) return d;
    }
    throw new Error(`no steady curve between ${minRadius} m and ${maxRadius} m`);
  }

  /**
   * Rides to `distance` at about `speed`, lets go of the steering for half a
   * second, then measures how fast the bike drifts sideways.
   */
  function driftOnCurve(distance: number, speed: number) {
    const race = startedRace();
    // Let the field ride off first, so no rider bumps or kicks the bike while it is measured.
    stepFor(race, 30, NO_INPUT);
    const pilot = autopilot(race, { targetSpeed: speed });
    secondsUntil(race, pilot, () => player(race).distance >= distance - speed / 2);
    secondsUntil(race, () => ({ ...pilot(), steer: 0 }), () => player(race).distance >= distance);
    const before = player(race);
    race.step({ ...pilot(), steer: 0 });
    const after = player(race);
    return {
      drift: (after.offset - before.offset) / STEP_SECONDS,
      speed: after.speed,
      curvature: race.track.sampleAt((before.distance + after.distance) / 2).curvature,
    };
  }

  it("is pushed outwards on curves in proportion to speed squared times curvature", () => {
    const { track } = createRace({ seed: 1 });
    const sweeper = steadyCurve(track, track.startDistance, 200, 450);
    const bend = steadyCurve(track, track.startDistance, 55, 110);
    const fastOnSweeper = driftOnCurve(sweeper, 45);
    const slowOnSweeper = driftOnCurve(sweeper, 28);
    const onBend = driftOnCurve(bend, 28);
    const measurements = [fastOnSweeper, slowOnSweeper, onBend];

    // The measurements differ enough in speed and in curvature to tell the law apart.
    expect(fastOnSweeper.speed ** 2 / slowOnSweeper.speed ** 2).toBeGreaterThan(1.8);
    expect(Math.abs(onBend.curvature / slowOnSweeper.curvature)).toBeGreaterThan(1.8);
    for (const { drift, curvature } of measurements) expect(Math.sign(drift)).toBe(-Math.sign(curvature));
    const pushPerSpeedSquaredCurvature = measurements.map(
      ({ drift, speed, curvature }) => -drift / (speed * speed * curvature),
    );
    for (const ratio of pushPerSpeedSquaredCurvature) {
      expect(ratio).toBeGreaterThan(0);
      expect(ratio / pushPerSpeedSquaredCurvature[0]).toBeCloseTo(1, 1);
    }
  });

  it("keeps the bike within the shoulders", () => {
    const race = startedRace();
    const { roadHalfWidth, shoulderWidth } = race.track;
    secondsUntil(race, FULL_THROTTLE, () => player(race).speed >= 20);

    stepFor(race, 4, { ...FULL_THROTTLE, steer: 1 });
    expect(player(race).offset).toBeCloseTo(roadHalfWidth + shoulderWidth, 6);
    stepFor(race, 6, { ...FULL_THROTTLE, steer: -1 });
    expect(player(race).offset).toBeCloseTo(-(roadHalfWidth + shoulderWidth), 6);
  });
});

/** Rides a started race to the finish line, returning the race clock just before the crossing step. */
function rideToTheFinish(race: Race) {
  const pilot = autopilot(race);
  let clockBefore = 0;
  secondsUntil(race, pilot, () => {
    if (player(race).distance >= race.track.finishDistance) return true;
    clockBefore = race.snapshot().clock;
    return false;
  });
  return clockBefore;
}

describe("the finish", () => {
  it("ends the player's race when they cross the finish line", () => {
    const race = startedRace();

    const clockBefore = rideToTheFinish(race);

    const events = race
      .drainEvents()
      .filter((event) => event.type === "player-race-over" || (event.type === "rider-finished" && event.rider === PLAYER));
    expect(events).toEqual([
      { type: "rider-finished", rider: PLAYER, time: expect.any(Number), position: expect.any(Number) },
      { type: "player-race-over", outcome: "finished" },
    ]);
    const { time, position } = events[0] as { time: number; position: number };
    expect(time).toBeGreaterThan(clockBefore);
    expect(time).toBeLessThanOrEqual(race.snapshot().clock);
    expect(player(race)).toMatchObject({ status: "finished", finishTime: time, position });
  });

  it("lets the finished bike coast to a stop before the road runs out, whatever the input", () => {
    const race = startedRace();
    rideToTheFinish(race);
    race.drainEvents();

    stepFor(race, 30, { ...FULL_THROTTLE, steer: 1 });

    expect(player(race).speed).toBe(0);
    expect(player(race).distance).toBeLessThan(race.track.length);
    const aboutThePlayer = race
      .drainEvents()
      .filter((event) => event.type === "player-race-over" || ("rider" in event && event.rider === PLAYER));
    expect(aboutThePlayer).toEqual([]);
  });
});

describe("fast-forwarding to the results", () => {
  it("refuses while the player is still racing", () => {
    const race = startedRace();
    stepFor(race, 10, FULL_THROTTLE);

    expect(() => race.fastForward()).toThrow(/still racing/);
  });

  it("gives the final results once the player's race is over", () => {
    const race = startedRace();
    rideToTheFinish(race);
    const { finishTime: time, position } = player(race);

    const results = race.fastForward();

    expect(results).toMatchObject({ outcome: "finished", time, position });
    expect(results.standings).toContainEqual(
      expect.objectContaining({ rider: PLAYER, status: "finished", position, time }),
    );
  });
});

describe("determinism", () => {
  /** A busy, repeatable script of inputs: throttle, braking, weaving, punches and kicks. */
  function scriptedInput(step: number): PlayerInput {
    return {
      throttle: step % 300 < 240 ? 1 : 0.3,
      brake: step % 300 >= 270 ? 0.6 : 0,
      steer: Math.sin(step / 45) * 0.8,
      punch: step % 97 === 0,
      kick: step % 131 === 0,
    };
  }

  function record(race: Race, seconds: number) {
    const snapshots = [];
    const events = [];
    for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
      race.step(scriptedInput(step));
      snapshots.push(race.snapshot());
      events.push(...race.drainEvents());
    }
    return { snapshots, events };
  }

  it("replays a race identically from the same seed and inputs", () => {
    const first = record(createRace({ seed: 42 }), 200);
    const second = record(createRace({ seed: 42 }), 200);

    expect(second).toEqual(first);
    expect(first.events.map((event) => event.type)).toContain("race-started");
  });

  it("never changes a snapshot it has handed out", () => {
    const race = startedRace();
    stepFor(race, 5, FULL_THROTTLE);
    const snapshot = race.snapshot();
    const copy = JSON.parse(JSON.stringify(snapshot));

    stepFor(race, 5, { ...FULL_THROTTLE, steer: 1 });

    expect(snapshot).toEqual(copy);
  });
});
