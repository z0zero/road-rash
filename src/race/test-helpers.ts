/**
 * Scripted riding for the Race module's tests. Everything here drives a race
 * through its interface and reads only what any caller can: snapshots and the
 * track.
 */
import { createRace, NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race } from ".";

export const STEPS_PER_SECOND = 60;
export const FULL_THROTTLE: PlayerInput = { ...NO_INPUT, throttle: 1 };

/** km/h in metres per second. */
export function kmh(value: number) {
  return value / 3.6;
}

export function stepFor(race: Race, seconds: number, input: PlayerInput = NO_INPUT) {
  const steps = Math.round(seconds * STEPS_PER_SECOND);
  for (let i = 0; i < steps; i++) race.step(input);
}

/** A race whose countdown has just run out. */
export function startedRace(seed = 1) {
  const race = createRace({ seed });
  stepFor(race, 3);
  race.drainEvents();
  return race;
}

export function player(race: Race) {
  return race.snapshot().riders[PLAYER];
}

/** Steps with `input` until `done` holds, and returns how many seconds that took. */
export function secondsUntil(
  race: Race,
  input: PlayerInput | (() => PlayerInput),
  done: () => boolean,
  limitSeconds = 600,
) {
  let steps = 0;
  while (!done()) {
    if (steps >= limitSeconds * STEPS_PER_SECOND) throw new Error(`not done within ${limitSeconds} s`);
    race.step(typeof input === "function" ? input() : input);
    steps++;
  }
  return steps * STEP_SECONDS;
}

/**
 * Scripted input that rides the bike along the track near `lane` (an offset
 * from the centreline) at up to `targetSpeed`, braking for the bends ahead.
 */
export function autopilot(race: Race, { targetSpeed = Infinity, lane = 0 } = {}) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const rider = player(race);
    const sideways = (rider.offset - lastOffset) / STEP_SECONDS;
    lastOffset = rider.offset;
    let wanted = targetSpeed;
    for (let ahead = 0; ahead <= 200; ahead += 5) {
      const curvature = Math.abs(race.track.sampleAt(rider.distance + ahead).curvature);
      const cornerSpeed = Math.sqrt(16 / Math.max(curvature, 1e-6));
      wanted = Math.min(wanted, Math.sqrt(cornerSpeed ** 2 + 2 * 9 * ahead));
    }
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 0.5 * (lane - rider.offset) - 0.25 * sideways)),
      throttle: rider.speed < wanted - 0.5 ? 1 : 0,
      brake: rider.speed > wanted + 1 ? Math.min(1, (rider.speed - wanted) / 4) : 0,
    };
  };
}
