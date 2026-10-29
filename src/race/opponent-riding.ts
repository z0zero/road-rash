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

/** The least skilled opponent rides at this share of the fastest safe speed, the most skilled at the second. */
const PACE_RANGE = [0.78, 0.93] as const;

/** The share of the fastest safe speed an opponent of a skill (0 to 1) rides at. */
export function paceFor(skill: number): number {
  return PACE_RANGE[0] + (PACE_RANGE[1] - PACE_RANGE[0]) * clamp(skill, 0, 1);
}

/** Catch-up leaves opponents within this many metres of the player at their usual pace... */
const CATCH_UP_NEAR = 75;
/** ...and grows with the distance beyond it, to its most at this many metres... */
const CATCH_UP_FAR = 400;
/** ...where opponents behind the player ride this share faster than their pace, and those ahead this share slower. */
const CATCH_UP_MOST = 0.08;

/**
 * The mild catch-up that keeps the field near the player: how many times its
 * usual pace an opponent rides `gap` metres ahead of the player (negative
 * when behind). Up to 1.08 far behind, down to 0.92 far ahead.
 */
export function catchUpFor(gap: number): number {
  const share = clamp((Math.abs(gap) - CATCH_UP_NEAR) / (CATCH_UP_FAR - CATCH_UP_NEAR), 0, 1);
  return 1 - Math.sign(gap) * CATCH_UP_MOST * share;
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
/** Opponents pass other riders with this many metres between their offsets... */
const PASSING_CLEARANCE = 1.6;
/** ...looking this many seconds ahead for riders they are catching. */
const PASSING_LOOK_AHEAD = 1.5;
/** Riders less than this many metres apart along the track are alongside each other. */
const ALONGSIDE = 3;
/** A rider ahead closer than this sideways (metres) is in the way: an opponent holds back behind them... */
const IN_THE_WAY = 1.1;
/** ...if it would reach them within this many seconds. */
const HOLD_BACK_TIME = 0.8;

/** What an opponent is up to besides racing. */
export interface Intent {
  /** A rider the opponent is riding up alongside, to fight them; null when it is just racing. */
  readonly alongside: Readonly<Motion> | null;
  /** Its pace as a share of its usual pace: above 1 to keep up with a fight, below 1 while it drops back. */
  readonly paceShare: number;
}

/** Just racing. */
export const RACING: Intent = { alongside: null, paceShare: 1 };

/** An opponent riding alongside a rider to fight them keeps this many metres to their side, within reach... */
const FIGHTING_GAP = 1.4;
/** ...closing in on them along the track at this many metres per second for every metre between them... */
const LEVEL_GAIN = 0.8;
/** ...but no faster than this (m/s), so that running into them only bumps them. */
const MAX_CLOSING = 5;

/**
 * An opponent's controls for one step: the throttle and brake to ride at its
 * pace (times `catchUp`, see `catchUpFor`), slowing in time for the bends
 * ahead, and the steering to follow its racing line, cutting towards the
 * inside of bends, and to get around the other riders on the road (`field`,
 * the motions of every rider still racing). With an `intent` to ride
 * alongside someone, it rides level with them, to their side, instead of
 * following its racing line, though never faster than its pace allows.
 */
export function opponentControls(
  motion: Readonly<Motion>,
  riding: OpponentRiding,
  track: Track,
  field: readonly Readonly<Motion>[],
  catchUp: number,
  intent: Intent = RACING,
): Controls {
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const bendAhead = track.sampleAt(motion.distance + motion.speed * APEX_LOOK_AHEAD).curvature;
  const apexShift = clamp(bendAhead * APEX_SHIFT_PER_CURVATURE, -MAX_APEX_SHIFT, MAX_APEX_SHIFT);
  const racingLine = clamp(riding.lane + apexShift, -edge, edge);
  const { alongside } = intent;
  const { line, holdBehind } = lineAround(motion, alongside ? lineBeside(motion, alongside, edge) : racingLine, field, edge);

  const safe = safeSpeedAt(track, motion.distance + motion.speed * BRAKING_LEAD);
  let wanted = Math.min(riding.pace * intent.paceShare * catchUp * Math.min(TUNING.topSpeed, safe), holdBehind);
  if (alongside) {
    const closing = clamp(LEVEL_GAIN * (alongside.distance - motion.distance), -MAX_CLOSING, MAX_CLOSING);
    wanted = Math.min(wanted, Math.max(0, alongside.speed + closing));
  }
  const throttle = clamp((wanted - motion.speed) * THROTTLE_PER_SPEED, 0, 1);
  const brake = clamp((motion.speed - wanted) * BRAKE_PER_SPEED, 0, 1);

  // Steer towards the line, and against the curve's outward push (the same law riding follows).
  const push = -TUNING.curvePush * motion.speed * motion.speed * track.sampleAt(motion.distance).curvature;
  const sideways = clamp(LINE_RESPONSE * (line - motion.offset), -LINE_CHANGE_SPEED, LINE_CHANGE_SPEED);
  const reach = maxSidewaysSpeed(motion.speed);
  const steer = reach > 0 ? clamp((sideways - push) / reach, -1, 1) : 0;
  return { throttle, brake, steer };
}

/** The line `FIGHTING_GAP` to the side of `rider` that `me` is on, or their other side if that one is off the road. */
function lineBeside(me: Readonly<Motion>, rider: Readonly<Motion>, edge: number) {
  const side = me.offset >= rider.offset ? 1 : -1;
  const line = rider.offset + side * FIGHTING_GAP;
  return clamp(Math.abs(line) <= edge ? line : rider.offset - side * FIGHTING_GAP, -edge, edge);
}

/**
 * Where to ride to get around the riders nearby: the racing line if it is
 * clear, otherwise the clear line nearest to where the opponent is now. Riders
 * it is catching block the lines close to theirs, and a rider alongside blocks
 * everything beyond them, so an opponent never steers across one. When a rider
 * it is about to reach is in the way, it holds back to their speed.
 */
function lineAround(me: Readonly<Motion>, racingLine: number, field: readonly Readonly<Motion>[], edge: number) {
  const blocked: [number, number][] = [];
  let holdBehind = Infinity;
  for (const other of field) {
    if (other === me) continue;
    const ahead = other.distance - me.distance;
    const closing = Math.max(0, me.speed - other.speed);
    if (Math.abs(ahead) < ALONGSIDE) {
      const onTheRight = other.offset > me.offset || (other.offset === me.offset && ahead > 0);
      blocked.push(onTheRight ? [other.offset - PASSING_CLEARANCE, Infinity] : [-Infinity, other.offset + PASSING_CLEARANCE]);
    } else if (ahead > 0 && ahead < ALONGSIDE + 2 + closing * PASSING_LOOK_AHEAD) {
      blocked.push([other.offset - PASSING_CLEARANCE, other.offset + PASSING_CLEARANCE]);
    }
    if (ahead > 0 && ahead < ALONGSIDE + closing * HOLD_BACK_TIME && Math.abs(other.offset - me.offset) < IN_THE_WAY) {
      holdBehind = Math.min(holdBehind, other.speed - 0.5);
    }
  }
  return { line: nearestClearLine(racingLine, me.offset, blocked, edge), holdBehind };
}

/**
 * The racing line if no blocked stretch of offsets covers it, otherwise the
 * nearer (to `current`) end of the blocked stretch that does, within the road's
 * `edge`. If neither end is on the road, the opponent stays where it is.
 */
function nearestClearLine(racingLine: number, current: number, blocked: [number, number][], edge: number) {
  blocked.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of blocked) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  const covering = merged.find(([from, to]) => racingLine > from && racingLine < to);
  if (!covering) return racingLine;
  const ends = covering.filter((end) => Math.abs(end) <= edge);
  if (ends.length === 0) return current;
  return ends.reduce((best, end) => (Math.abs(end - current) < Math.abs(best - current) ? end : best));
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
