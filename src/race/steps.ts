/** The race advances 60 times a second... */
export const STEPS_PER_SECOND = 60;

/** ...in fixed steps of exactly this many seconds. */
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

/** A duration in seconds as the nearest whole number of steps. */
export function stepsIn(seconds: number): number {
  return Math.round(seconds * STEPS_PER_SECOND);
}
