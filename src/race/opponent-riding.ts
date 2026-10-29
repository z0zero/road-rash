import { clamp, maxSidewaysSpeed, type Controls, type Motion } from "./riding";
import type { Track } from "./track";
import { TUNING } from "./tuning";

/** How an opponent rides this race. */
export interface OpponentRiding {
  /** The share of the fastest safe speed the opponent rides at (1 is flat out). */
  readonly pace: number;
  /** The offset the opponent rides at between bends (metres right of the centreline). */
  readonly lane: number;
}

/** Opponents hold their line through a bend using at most this share of the sideways speed steering gives... */
const CORNER_GRIP = 0.78;
/** ...and plan to brake for the bends ahead at this rate (m/s²), short of the bike's full braking. */
const PLANNED_BRAKING = 8;
/** Opponents brake for what lies this many seconds ahead, to allow for the time braking takes to bite. */
const BRAKING_LEAD = 0.3;
/** How hard an opponent opens the throttle per m/s below the speed it wants, and brakes per m/s above it. */
const THROTTLE_PER_SPEED = 0.5;
const BRAKE_PER_SPEED = 0.25;
/** How quickly an opponent steers back to its line (1/s)... */
const LINE_RESPONSE = 1.5;
/** ...at up to this many metres per second sideways. */
const LINE_CHANGE_SPEED = 4;
/** Opponents place themselves for the bend this many seconds ahead... */
const APEX_LOOK_AHEAD = 0.7;
/** ...moving towards its inside by this many metres per unit of curvature (1/m)... */
const APEX_SHIFT_PER_CURVATURE = 120;
/** ...by up to this many metres. */
const MAX_APEX_SHIFT = 2;
/** Opponents keep their line at least this far inside the road's edges (metres). */
const EDGE_MARGIN = 0.8;

/**
 * An opponent's controls for one step: the throttle and brake to ride at its
 * pace, slowing in time for the bends ahead, and the steering to follow its
 * racing line, cutting towards the inside of bends.
 */
export function opponentControls(motion: Readonly<Motion>, riding: OpponentRiding, track: Track): Controls {
  const safe = safeSpeedAt(track, motion.distance + motion.speed * BRAKING_LEAD);
  const wanted = riding.pace * Math.min(TUNING.topSpeed, safe);
  const throttle = clamp((wanted - motion.speed) * THROTTLE_PER_SPEED, 0, 1);
  const brake = clamp((motion.speed - wanted) * BRAKE_PER_SPEED, 0, 1);

  const bendAhead = track.sampleAt(motion.distance + motion.speed * APEX_LOOK_AHEAD).curvature;
  const apexShift = clamp(bendAhead * APEX_SHIFT_PER_CURVATURE, -MAX_APEX_SHIFT, MAX_APEX_SHIFT);
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const line = clamp(riding.lane + apexShift, -edge, edge);

  // Steer towards the line, and against the curve's outward push (the same law riding follows).
  const push = -TUNING.curvePush * motion.speed * motion.speed * track.sampleAt(motion.distance).curvature;
  const sideways = clamp(LINE_RESPONSE * (line - motion.offset), -LINE_CHANGE_SPEED, LINE_CHANGE_SPEED);
  const reach = maxSidewaysSpeed(motion.speed);
  const steer = reach > 0 ? clamp((sideways - push) / reach, -1, 1) : 0;
  return { throttle, brake, steer };
}

const safeSpeeds = new WeakMap<Track, Float64Array>();

/**
 * The fastest an opponent riding flat out goes at a distance: slow enough to
 * hold its line through the bend there, and to brake in time for the bends
 * ahead. Worked out once per track, a metre at a time.
 */
function safeSpeedAt(track: Track, distance: number): number {
  let speeds = safeSpeeds.get(track);
  if (!speeds) {
    speeds = new Float64Array(track.length + 1);
    for (let d = 0; d <= track.length; d++) speeds[d] = holdingSpeed(Math.abs(track.sampleAt(d).curvature));
    for (let d = track.length - 1; d >= 0; d--) {
      speeds[d] = Math.min(speeds[d], Math.sqrt(speeds[d + 1] * speeds[d + 1] + 2 * PLANNED_BRAKING));
    }
    safeSpeeds.set(track, speeds);
  }
  const metre = clamp(Math.floor(distance), 0, track.length - 1);
  return Math.min(speeds[metre], speeds[metre + 1]);
}

/** The fastest speed at which steering, using CORNER_GRIP of its reach, can hold a line against a curve's push. */
function holdingSpeed(curvature: number): number {
  const holds = (speed: number) =>
    TUNING.curvePush * speed * speed * curvature <= CORNER_GRIP * maxSidewaysSpeed(speed);
  if (holds(TUNING.topSpeed)) return TUNING.topSpeed;
  let low = 0;
  let high: number = TUNING.topSpeed;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (holds(middle)) low = middle;
    else high = middle;
  }
  return low;
}
