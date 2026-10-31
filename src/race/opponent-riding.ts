import type { CatchUp, DifficultyTuning } from "./difficulty";
import type { Footprint } from "./footprint";
import { BIKE_LENGTH, BIKE_WIDTH, clamp, maxSidewaysSpeed, type Controls, type Motion } from "./riding";
import type { Moving, Track } from "./track";
import { TUNING } from "./tuning";

/** How an opponent rides this race. */
export interface OpponentRiding {
  /** The share of the fastest safe speed the opponent rides at (1 is flat out). */
  readonly pace: number;
  /** The offset the opponent rides at between bends (metres right of the centreline). */
  readonly lane: number;
}

/** On Normal, the least skilled opponent's pace is this share of the fastest safe speed, and the most skilled's the second. */
const PACE_RANGE = [0.78, 0.93] as const;

/**
 * An opponent's pace, the share of the fastest safe speed it rides at, from
 * its skill (0 to 1) and the difficulty: within `PACE_RANGE` on Normal, and
 * that times the difficulty's `pace` on the others.
 */
export function paceFor(skill: number, { pace }: DifficultyTuning): number {
  return pace * (PACE_RANGE[0] + (PACE_RANGE[1] - PACE_RANGE[0]) * clamp(skill, 0, 1));
}

/** How fast (m/s) an opponent's pace takes it where it is now on `track`, with nothing in its way. */
export function paceAt(motion: Readonly<Motion>, riding: OpponentRiding, track: Track): number {
  return riding.pace * Math.min(TUNING.topSpeed, safeSpeedAt(track, motion.distance + motion.speed * BRAKING_LEAD));
}

/**
 * The mild catch-up that keeps the field near the player: how many times its
 * usual pace an opponent rides `gap` metres ahead of the player (negative
 * when behind), with the difficulty's `catchUp`: on Normal, its usual pace
 * within 75 m, up to 1.08 times it 400 m behind and more, and down to 0.92
 * times it 400 m ahead and more.
 */
export function catchUpFor(gap: number, { near, far, most }: CatchUp): number {
  const share = clamp((Math.abs(gap) - near) / (far - near), 0, 1);
  return 1 - Math.sign(gap) * most * share;
}

/** Opponents hold their line through a bend using at most this share of the sideways speed steering gives... */
const CORNER_GRIP = 0.78;
/** ...and plan to brake for the bends ahead at this rate (m/s²), short of the bike's full braking. */
const PLANNED_BRAKING = 8;
/** Opponents, and cops, brake for what lies this many seconds ahead, to allow for the time braking takes to bite. */
export const BRAKING_LEAD = 0.3;
/** How hard an opponent opens the throttle per m/s below the speed it wants, and brakes per m/s above it. */
const THROTTLE_PER_SPEED = 0.5;
const BRAKE_PER_SPEED = 0.25;
/** How quickly an opponent, or a cop, steers back to its line (1/s)... */
const LINE_RESPONSE = 1.5;
/** ...at up to this many metres per second sideways. */
const LINE_CHANGE_SPEED = 4;
/** Opponents place themselves for the bend this many seconds ahead... */
const APEX_LOOK_AHEAD = 0.7;
/** ...moving towards its inside by this many metres per unit of curvature (1/m)... */
const APEX_SHIFT_PER_CURVATURE = 120;
/** ...by up to this many metres. */
const MAX_APEX_SHIFT = 2;
/** Opponents, and cops, keep their line at least this far inside the road's edges (metres). */
export const EDGE_MARGIN = 0.8;
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

/** A bike reaches this many metres ahead of and behind its middle... */
const BIKE_HALF_LENGTH = BIKE_LENGTH / 2;
/** ...and this many to either side of it. */
const BIKE_HALF_WIDTH = BIKE_WIDTH / 2;
/** Opponents pass cars and obstacles with this many metres between their middle and the side of what they pass. */
const FOOTPRINT_CLEARANCE = 1;
/** Opponents look this many seconds ahead for the cars and obstacles they are coming up to... */
const FOOTPRINT_LOOK_AHEAD = 1.5;
/** ...and slow down for one closer than this to their middle, sideways, beyond its side (metres). */
const FOOTPRINT_IN_THE_WAY = 0.7;
/** They look this many seconds ahead for the cars coming towards them, so as never to pull out in front of one to pass something... */
const ONCOMING_LOOK_AHEAD = 3;
/** ...and never cut across the path of a car or an obstacle they would get to within this many seconds. */
const CROSSING_TIME = 1.5;
/**
 * Held back to a standstill, or nearly, behind something in its way, an
 * opponent or a cop whose line leads round it rolls on at this walking pace
 * (m/s), since a bike can't move sideways while it stands still...
 */
const WALKING_PACE = 2;
/**
 * ...and riding no faster than this (m/s), it sees a car or an obstacle
 * ahead of it, in its path, as something to steer round, not as one alongside
 * it, even nose to tail with it; and it goes round a rider just in front of
 * it, in its path, on whichever side of them has room for its bike (see
 * `sideToPass`).
 */
const CRAWLING = 2 * WALKING_PACE;
/** An opponent shoved sideways by a kick faster than this (m/s) rides the kick out before it steers back to its line. */
const RIDING_OUT_A_KICK = 1;
/**
 * Getting out of the way of a car or an obstacle, an opponent steers this
 * much more quickly to its line (1/s), and so does a cop in a hurry...
 */
const EVASIVE_RESPONSE = 4;
/** ...at up to this many metres per second sideways. */
const EVASIVE_SPEED = 6;

/** What an opponent is up to besides racing. */
export interface Intent {
  /** A rider the opponent is riding up alongside, to fight them; null when it is just racing. */
  readonly alongside: Readonly<Motion> | null;
  /** Its pace as a share of its usual pace: above 1 to keep up with a fight, below 1 while it drops back. */
  readonly paceShare: number;
}

/** Just racing. */
export const RACING: Intent = { alongside: null, paceShare: 1 };

/** An opponent, or a cop, riding alongside a rider to fight them keeps this many metres to their side, within reach... */
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
 * the motions of every rider still racing) and the cars and obstacles on it
 * (`carsAndObstacles`). With an `intent` to ride alongside someone, it rides level
 * with them, to their side, instead of following its racing line, though
 * never faster than its pace allows.
 */
export function opponentControls(
  motion: Readonly<Motion>,
  riding: OpponentRiding,
  track: Track,
  field: readonly Readonly<Motion>[],
  catchUp: number,
  intent: Intent = RACING,
  carsAndObstacles: readonly Footprint[] = [],
): Controls {
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const bendAhead = track.sampleAt(motion.distance + motion.speed * APEX_LOOK_AHEAD).curvature;
  const apexShift = clamp(bendAhead * APEX_SHIFT_PER_CURVATURE, -MAX_APEX_SHIFT, MAX_APEX_SHIFT);
  const racingLine = clamp(riding.lane + apexShift, -edge, edge);
  const level = intent.alongside ? levelWith(motion, intent.alongside, edge) : null;
  // Squeezing past something at walking pace, it may go as far out as the shoulder takes its bike.
  const shoulderEdge = track.roadHalfWidth + track.shoulderWidth - BIKE_HALF_WIDTH;
  const { line, holdBehind, evading } = lineAround(motion, level ? level.line : racingLine, field, carsAndObstacles, edge, shoulderEdge);

  const safe = safeSpeedAt(track, motion.distance + motion.speed * BRAKING_LEAD);
  let wanted = Math.min(riding.pace * intent.paceShare * catchUp * Math.min(TUNING.topSpeed, safe), holdBehind);
  if (level) wanted = Math.min(wanted, level.speed);
  const throttle = clamp((wanted - motion.speed) * THROTTLE_PER_SPEED, 0, 1);
  const brake = clamp((motion.speed - wanted) * BRAKE_PER_SPEED, 0, 1);

  // Steer towards the line, and against the curve's outward push (the same law riding follows).
  const push = -TUNING.curvePush * motion.speed * motion.speed * track.sampleAt(motion.distance).curvature;
  // Out of the way of a car or an obstacle, briskly.
  let sideways = sidewaysTowards(line, motion.offset, evading);
  // Kicked off its line, it lets the kick carry it, holding only against the curve, until the shove dies down.
  if (Math.abs(motion.kickShove) > RIDING_OUT_A_KICK && sideways * motion.kickShove < 0) sideways = 0;
  const reach = maxSidewaysSpeed(motion.speed);
  const steer = reach > 0 ? clamp((sideways - push) / reach, -1, 1) : 0;
  return { throttle, brake, steer };
}

/**
 * Where a bike rides to fight `rider` alongside them: on the line
 * `FIGHTING_GAP` to the side of them it is on, or their other side if that one
 * is off the road (offsets within `edge`), and at the speed that brings it
 * level with them, closing in at no more than `MAX_CLOSING`. Opponents ride
 * there to pick a fight with the player, and cops to fight back.
 */
export function levelWith(
  me: Readonly<Motion>,
  rider: Moving,
  edge: number,
): { line: number; speed: number } {
  const side = me.offset >= rider.offset ? 1 : -1;
  const beside = rider.offset + side * FIGHTING_GAP;
  const line = clamp(Math.abs(beside) <= edge ? beside : rider.offset - side * FIGHTING_GAP, -edge, edge);
  const closing = clamp(LEVEL_GAIN * (rider.distance - me.distance), -MAX_CLOSING, MAX_CLOSING);
  return { line, speed: Math.max(0, rider.speed + closing) };
}

/**
 * How fast (m/s, positive to the right) an opponent or a cop steers sideways
 * from `offset` towards `line`: at an easy pace, or `briskly`, getting out of
 * the way of a car or an obstacle, or in a hurry.
 */
export function sidewaysTowards(line: number, offset: number, briskly: boolean): number {
  const [response, most] = briskly ? [EVASIVE_RESPONSE, EVASIVE_SPEED] : [LINE_RESPONSE, LINE_CHANGE_SPEED];
  return clamp(response * (line - offset), -most, most);
}

/** A stretch of offsets, from left to right. */
type Stretch = [number, number];

/**
 * The offsets a car or an obstacle takes up, as an opponent coming up to it
 * sees them: what to keep clear of, and, within that, where a bike would
 * touch it; how soon the opponent gets to it; whether that is so soon that
 * there is no time to cut across its path first; and whether the only way out
 * of its path is sideways, as from a car coming the other way, or one
 * alongside, which holding back won't get away from.
 */
interface Room {
  readonly keepClear: Stretch;
  readonly body: Stretch;
  /** Seconds until the opponent gets to it: 0 alongside it, Infinity if it isn't catching it. */
  readonly reachedIn: number;
  readonly close: boolean;
  readonly dodgeSideways: boolean;
}

/**
 * Where to ride to get around the riders, cars and obstacles nearby: the
 * racing line if it is clear, otherwise the clear line nearest to where the
 * opponent is now. Riders it is catching, and cars and obstacles it is coming
 * up to, block the lines close to theirs, and a rider or car alongside blocks
 * everything beyond them, so an opponent never steers across one; though,
 * crawling up to a rider just in front of it with no room for its bike on its
 * side of them, it goes round them on their other side (see `sideToPass`). A car
 * changing lanes blocks the lines from where it is to the lane it is moving
 * over to, and an opponent looks further ahead for the cars coming towards it.
 * When a rider it is about to reach is in the way, it holds back to their
 * speed; a slower car or an obstacle in the way, it slows for in time to ride
 * no faster than it when it gets there; but if its line takes it clear past
 * either, it rolls on at walking pace at least. Crawling, with no clear line,
 * it squeezes past through the nearest gap its bike fits through, out to
 * `squeezeEdge`: an opponent out onto the shoulder. Cops find their way
 * around the same way, out to the edges they give: a cop on patrol or
 * fighting back squeezes past only on the road.
 */
export function lineAround(
  me: Readonly<Motion>,
  racingLine: number,
  field: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
  edge: number,
  squeezeEdge: number,
) {
  const blocked: Stretch[] = [];
  /** What the riders' bikes take up, as a bike squeezing past them sees them: a bike's width either side of their middles. */
  const ridersBikes: Stretch[] = [];
  /** The riders it is about to reach, in its way. */
  const inTheWay: Readonly<Motion>[] = [];
  for (const other of field) {
    if (other === me) continue;
    const ahead = other.distance - me.distance;
    const closing = Math.max(0, me.speed - other.speed);
    if (Math.abs(ahead) < ALONGSIDE) {
      const side = sideToPass(me, other, ahead, squeezeEdge);
      const beyond = (room: number): Stretch => (side < 0 ? [other.offset - room, Infinity] : [-Infinity, other.offset + room]);
      blocked.push(beyond(PASSING_CLEARANCE));
      ridersBikes.push(beyond(BIKE_WIDTH));
    } else if (ahead > 0 && ahead < ALONGSIDE + 2 + closing * PASSING_LOOK_AHEAD) {
      blocked.push([other.offset - PASSING_CLEARANCE, other.offset + PASSING_CLEARANCE]);
      ridersBikes.push([other.offset - BIKE_WIDTH, other.offset + BIKE_WIDTH]);
    }
    if (ahead > 0 && ahead < ALONGSIDE + closing * HOLD_BACK_TIME && Math.abs(other.offset - me.offset) < IN_THE_WAY) inTheWay.push(other);
  }
  // Where the cars and obstacles it is alongside or coming up to leave it no room.
  const unsafe: Room[] = [];
  let headOn = false;
  for (const thing of carsAndObstacles) {
    const ahead = thing.distance - me.distance;
    const reach = thing.halfLength + BIKE_HALF_LENGTH;
    const closing = Math.max(0, me.speed - thing.velocity);
    const lookAhead = thing.velocity < 0 ? ONCOMING_LOOK_AHEAD : FOOTPRINT_LOOK_AHEAD;
    // Crawling up to something in its path, it is behind it, however close, not alongside it.
    const inFront = me.speed <= CRAWLING && ahead > 0 && Math.abs(thing.offset - me.offset) < thing.halfWidth + BIKE_HALF_WIDTH;
    const alongside = Math.abs(ahead) < reach + 1 && !inFront;
    if (!alongside && (ahead <= 0 || ahead - reach >= 2 + closing * lookAhead)) continue;
    // A car changing lanes takes up the road from where it is to the lane it is moving over to.
    const left = Math.min(thing.offset, thing.movingTo);
    const right = Math.max(thing.offset, thing.movingTo);
    // Alongside it, everything beyond it too.
    const around = (room: number): Stretch =>
      !alongside ? [left - room, right + room] : thing.offset > me.offset ? [left - room, Infinity] : [-Infinity, right + room];
    const keepClear = around(thing.halfWidth + FOOTPRINT_CLEARANCE);
    const reachedIn = alongside ? 0 : closing > 0 ? Math.max(0, ahead - reach) / closing : Infinity;
    const close = ahead - reach < 2 + closing * CROSSING_TIME;
    const dodgeSideways = close && (alongside || thing.velocity < 0);
    unsafe.push({ keepClear, body: around(thing.halfWidth + BIKE_HALF_WIDTH), reachedIn, close, dodgeSideways });
    if (thing.velocity < 0 && me.offset > keepClear[0] && me.offset < keepClear[1]) headOn = true;
  }
  // Crawling, it can squeeze through a gap where it would otherwise stay put.
  const squeeze = me.speed <= CRAWLING ? { bodies: [...ridersBikes, ...unsafe.map(({ body }) => body)], edge: squeezeEdge } : null;
  const line = nearestClearLine(racingLine, me.offset, blocked, unsafe, edge, squeeze);
  // It holds back to the speed of a rider in its way, unless its line takes it clear past them.
  let holdBehind = Infinity;
  for (const other of inTheWay) {
    holdBehind = Math.min(holdBehind, heldBackTo(other.speed - 0.5, Math.abs(line - other.offset) >= BIKE_WIDTH));
  }
  // Boxed in, with a car coming at it: it brakes hard, to drop back behind whoever is boxing it in and get out of the way.
  if (headOn && line === me.offset) holdBehind = 0;
  for (const thing of carsAndObstacles) {
    const ahead = thing.distance - me.distance;
    if (ahead <= 0 || thing.velocity < 0) continue;
    const [left, right] = [Math.min(thing.offset, thing.movingTo), Math.max(thing.offset, thing.movingTo)];
    const [from, to] = [left - thing.halfWidth - FOOTPRINT_IN_THE_WAY, right + thing.halfWidth + FOOTPRINT_IN_THE_WAY];
    // In the way of where it is, or of the line it is taking...
    if ((me.offset > from && me.offset < to) || (line > from && line < to)) {
      const room = Math.max(0, ahead - thing.halfLength - BIKE_HALF_LENGTH - 2);
      const slowEnough = thing.velocity + Math.sqrt(2 * PLANNED_BRAKING * room);
      // ...it slows for it in time, unless its line takes it clear past it.
      const clearPast = line <= left - thing.halfWidth - BIKE_HALF_WIDTH || line >= right + thing.halfWidth + BIKE_HALF_WIDTH;
      holdBehind = Math.min(holdBehind, heldBackTo(slowEnough, clearPast));
    }
  }
  const evading = unsafe.some(({ keepClear: [from, to] }) => me.offset > from && me.offset < to);
  return { line, holdBehind, evading };
}

/**
 * Which side of another rider (`other`) a bike at `me` goes by them on, with
 * them alongside it, `ahead` metres in front of it (behind it, if negative):
 * 1 for their right, -1 for their left. The side of them it is on; nose to
 * tail with them, their left if they are in front and their right if behind,
 * as in a bump the one in front gives way to the right. But crawling up to a
 * rider just in front of it, within a bike's width of its line, it goes by
 * them on their other side if there is no room for its bike on its own,
 * between them and `squeezeEdge`, and there is on the other: it rolls round
 * them rather than wait behind them for as long as they stand there.
 */
function sideToPass(me: Readonly<Motion>, other: Readonly<Motion>, ahead: number, squeezeEdge: number): number {
  const away = Math.sign(me.offset - other.offset) || (ahead > 0 ? -1 : 1);
  const inItsPath = me.speed <= CRAWLING && ahead > 0 && Math.abs(other.offset - me.offset) < BIKE_WIDTH;
  const room = (side: number) => squeezeEdge - side * other.offset > BIKE_WIDTH;
  return !inItsPath || room(away) || !room(-away) ? away : -away;
}

/**
 * How fast a bike held back behind something in its way rides: no faster
 * than `speed`; but if its line takes it clear past it (`clearPast`), it rolls
 * on at walking pace at least, so that it never stands for good behind
 * something that has stopped.
 */
function heldBackTo(speed: number, clearPast: boolean): number {
  return clearPast ? Math.max(speed, WALKING_PACE) : speed;
}

/**
 * The racing line if no blocked stretch of offsets covers it (riders' are
 * `blocked`, cars' and obstacles' `unsafe`), otherwise the nearer (to
 * `current`) end of the blocked stretch that does, within the road's `edge`.
 * An opponent never steers across the path of a car or an obstacle it is
 * close to and not already in the way of: it gets as near the racing line as
 * it can on its side of them. In the way of one, it gets out of its path on
 * a side it can get to before it gets there, or else the nearer side. If no
 * end is within reach, it stays where it is, to hold back behind whatever is
 * in its way, or, crawling, it squeezes past it (see `squeezePast`); but
 * in the path of a car that holding back won't get it out of the way of, it
 * squeezes into the nearest gap between the cars and obstacles, clear of the
 * riders, that it can get to, down its middle, if there is one, or else,
 * crawling, it squeezes out of the car's path as past anything else.
 */
function nearestClearLine(
  racingLine: number,
  current: number,
  blocked: readonly Stretch[],
  unsafe: readonly Room[],
  edge: number,
  squeeze: Squeeze | null,
) {
  if (blocked.length === 0 && unsafe.length === 0) return clamp(racingLine, -edge, edge);
  const inside = (at: number, [from, to]: Stretch) => at > from && at < to;
  const close = unsafe.filter((room) => room.close);
  // The lines it can get to without cutting across the path of a car or an obstacle close ahead.
  let [lowest, highest] = [-Infinity, Infinity];
  for (const room of close) {
    const [from, to] = room.body;
    if (to <= current) lowest = Math.max(lowest, to);
    else if (from >= current) highest = Math.min(highest, from);
    else {
      const ways = waysOut(room, current);
      if (!ways.left) lowest = Math.max(lowest, to);
      if (!ways.right) highest = Math.min(highest, from);
    }
  }
  const reachable = (line: number) => line >= Math.max(lowest, -edge) && line <= Math.min(highest, edge);
  const inThePath = close.some(({ body }) => inside(current, body));
  const stretches = merge([...blocked, ...unsafe.map(({ keepClear }) => keepClear)]);
  const covering = stretches.find((stretch) => inside(racingLine, stretch));
  if (!covering && reachable(racingLine)) return racingLine;
  if (!covering && !inThePath) {
    // As near the racing line as it can get on its side of the cars and obstacles in the way.
    let [left, right] = [-edge, edge];
    for (const { keepClear, body } of close) {
      if (body[1] <= current) left = Math.max(left, Math.min(keepClear[1], current));
      else right = Math.min(right, Math.max(keepClear[0], current));
    }
    return clamp(racingLine, left, right);
  }
  const nearest = (lines: readonly number[]) =>
    lines.reduce((best, line) => (Math.abs(line - current) < Math.abs(best - current) ? line : best));
  // Out to an end of what covers the racing line or, in the path of something close, what covers the opponent.
  const around = inThePath ? [covering, stretches.find((stretch) => inside(current, stretch))] : [covering];
  const ends = around.flatMap((stretch) => stretch ?? []).filter(reachable);
  if (ends.length > 0) return nearest(ends);
  const squeezeOrStay = () => (squeeze ? squeezePast(current, squeeze, [lowest, highest]) : current);
  if (!unsafe.some(({ body, dodgeSideways }) => dodgeSideways && inside(current, body))) return squeezeOrStay();
  // Boxed in, in the path of a car: down the middle of the nearest gap between the cars and obstacles, and clear of the riders.
  const gaps = gapsBetween([...blocked, ...unsafe.map(({ body }) => body)], [-edge, edge]);
  const reachableGaps = gaps.map(([start, end]) => (start + end) / 2).filter(reachable);
  return reachableGaps.length > 0 ? nearest(reachableGaps) : squeezeOrStay();
}

/** Where a crawling bike can squeeze through: what the riders' bikes and the cars and obstacles take up, out to `edge`. */
interface Squeeze {
  readonly bodies: readonly Stretch[];
  readonly edge: number;
}

/**
 * Where a crawling bike at `current`, with no clear line, squeezes past what
 * keeps it there: on where it is, if nothing takes that up (`bodies`), or
 * else down the middle of the nearest gap between them that it fits through,
 * out to the `edge` (beyond the road's, on the shoulder), keeping to the lines
 * it can get to without cutting across the path of a car close ahead
 * (`reachable`); where it is, if there is none.
 */
function squeezePast(current: number, { bodies, edge }: Squeeze, reachable: Stretch): number {
  const gaps = gapsBetween(bodies, [Math.max(reachable[0], -edge), Math.min(reachable[1], edge)]);
  const fits = gaps.filter(([start, end]) => end > start);
  if (fits.some(([start, end]) => current >= start && current <= end)) return current;
  const away = ([start, end]: Stretch) => (current < start ? start - current : current - end);
  const nearest = fits.reduce<Stretch | null>((best, gap) => (best === null || away(gap) < away(best) ? gap : best), null);
  return nearest ? (nearest[0] + nearest[1]) / 2 : current;
}

/**
 * Which ways an opponent at `current`, in the path of a car or an obstacle
 * (`room`), can get out of it: on a side it can get to, steering out of the
 * way, before it gets to the car or obstacle; or else, if neither, the nearer
 * side.
 */
function waysOut({ body: [from, to], reachedIn }: Room, current: number) {
  const inTime = EVASIVE_SPEED * reachedIn;
  const [toTheLeft, toTheRight] = [current - from, to - current];
  return { left: toTheLeft <= inTime || toTheLeft <= toTheRight, right: toTheRight <= inTime || toTheRight < toTheLeft };
}

/**
 * The open stretches between `stretches` within `from` to `to`, from left to
 * right: each from where the stretches before it end to where the next one
 * starts, or to `to`.
 */
function gapsBetween(stretches: readonly Stretch[], [from, to]: Stretch): Stretch[] {
  const gaps: Stretch[] = [];
  let at = from;
  for (const [start, end] of merge(stretches)) {
    if (start > at) gaps.push([at, Math.min(start, to)]);
    at = Math.max(at, end);
  }
  if (at < to) gaps.push([at, to]);
  return gaps;
}

/** Stretches joined where they overlap, from left to right. */
function merge(stretches: readonly Stretch[]): Stretch[] {
  const merged: Stretch[] = [];
  for (const [from, to] of [...stretches].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** How hard a bike is ridden through bends. */
export interface BendLimits {
  /** The bike's top speed, m/s. */
  readonly topSpeed: number;
  /** The share of the sideways speed steering gives that holds the bike's line through a bend. */
  readonly grip: number;
  /** How hard (m/s²) its rider plans to brake for the bends ahead. */
  readonly braking: number;
}

/** Opponents ride a rider's bike, and hold their line with some steering to spare. */
const OPPONENT_LIMITS: BendLimits = { topSpeed: TUNING.topSpeed, grip: CORNER_GRIP, braking: PLANNED_BRAKING };

const safeSpeeds = new WeakMap<Track, Map<BendLimits, Float64Array>>();

/**
 * The fastest a bike ridden flat out within `limits` (an opponent's, unless
 * given) goes at a distance: slow enough to hold its line through the bend
 * there, and to brake in time for the bends ahead. Worked out once per track
 * and limits, a metre at a time.
 */
export function safeSpeedAt(track: Track, distance: number, limits: BendLimits = OPPONENT_LIMITS): number {
  let byLimits = safeSpeeds.get(track);
  if (!byLimits) {
    byLimits = new Map();
    safeSpeeds.set(track, byLimits);
  }
  let speeds = byLimits.get(limits);
  if (!speeds) {
    speeds = new Float64Array(track.length + 1);
    for (let d = 0; d <= track.length; d++) speeds[d] = holdingSpeed(Math.abs(track.sampleAt(d).curvature), limits);
    for (let d = track.length - 1; d >= 0; d--) {
      speeds[d] = Math.min(speeds[d], Math.sqrt(speeds[d + 1] * speeds[d + 1] + 2 * limits.braking));
    }
    byLimits.set(limits, speeds);
  }
  const metre = clamp(Math.floor(distance), 0, track.length - 1);
  return Math.min(speeds[metre], speeds[metre + 1]);
}

/** The fastest speed, up to the bike's top speed, at which steering, using the limits' grip, can hold a line against a curve's push. */
function holdingSpeed(curvature: number, { topSpeed, grip }: BendLimits): number {
  const holds = (speed: number) => TUNING.curvePush * speed * speed * curvature <= grip * maxSidewaysSpeed(speed);
  if (holds(topSpeed)) return topSpeed;
  let low = 0;
  let high = topSpeed;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (holds(middle)) low = middle;
    else high = middle;
  }
  return low;
}
