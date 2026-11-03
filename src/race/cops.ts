import { letGo } from "./busting";
import { carryOn, slide, STAND_STILL } from "./crashing";
import type { CopId, RiderId } from "./events";
import { punchOf, throwAttack, withinReach, type FighterState } from "./fighting";
import type { Footprint } from "./footprint";
import {
  BRAKING_LEAD,
  EDGE_MARGIN,
  EVASIVE_RESPONSE,
  EVASIVE_SPEED,
  levelWith,
  lineAround,
  PLANNED_BRAKING,
  safeSpeedAt,
  sidewaysTowards,
  type ACopsWay,
  type BendLimits,
} from "./opponent-riding";
import { copsInTheRace, type RaceState } from "./race-state";
import { PLAYER, whereIs } from "./riders";
import { BIKE_LENGTH, BIKE_WIDTH, clamp, maxSidewaysSpeed, type Motion } from "./riding";
import { STEP_SECONDS, stepsIn } from "./steps";
import { apart, type Moving, type Side, type Track } from "./track";
import { CAR_BRAKING } from "./traffic";
import { TUNING } from "./tuning";

/** Where a cop is in the race: waiting on the shoulder for the player to pass, riding in the race, or knocked off and out of it. */
export type CopStatus = "waiting" | "riding" | "knocked-off";

/** A fresh cop's stamina, which runs down to 0 as a rider's does from 100. */
export const COP_FULL_STAMINA: number = TUNING.cops.fullStamina;

/** The cops, in cop-id order: original names, none taken from Road Rash's rosters. */
const COP_NAMES = ["Sergeant Pike", "Deputy Gale"];

/** A cop on a motorcycle, in track space like the riders. Every cop carries a club, and comes off their bike only when knocked off. */
export interface Cop extends FighterState {
  readonly kind: "cop";
  readonly id: CopId;
  readonly name: string;
  status: CopStatus;
  /** The rider the cop is fighting back against, for hitting it; null when it isn't fighting anyone. */
  fightingBack: RiderId | null;
  /** Steps the cop has still to fight back for, unless it is hit again. */
  fightingBackSteps: number;
  /** Steps until the cop may throw its next attack. */
  attackCooldownSteps: number;
  /** The crashed rider the cop is riding to, to bust them; null when it isn't busting anyone. */
  busting: RiderId | null;
  /** Steps the cop has still to stand by a rider it has busted, before riding on. */
  standingBySteps: number;
  /**
   * The side of the road whose shoulder the cop is pulling over onto, or standing by a rider it has busted on: the side
   * it was on when it set off, which it keeps until it rides on; null when it isn't pulling over.
   */
  pullingOverTo: Side | null;
  /** Whether the cop is in the race near the player, as the race last said with cop-near or cop-gone. */
  near: boolean;
  /** Whether it is the cop's turn to follow the player; otherwise it holds back, well out of their way. */
  following: boolean;
  /** Steps the cop has still to follow the player for, unless something happens. */
  followingSteps: number;
}

/** The cops, each waiting on the right-hand shoulder at its waiting point, fresh. */
export function lineUpCops(track: Track): Cop[] {
  const shoulder = track.roadHalfWidth + track.shoulderWidth / 2;
  return TUNING.cops.waitingPoints.map((along, id) => ({
    kind: "cop",
    id,
    name: COP_NAMES[id],
    motion: { distance: track.startDistance + along, offset: shoulder, speed: 0, steering: 0, shove: 0, kickShove: 0 },
    status: "waiting",
    stamina: COP_FULL_STAMINA,
    stepsSinceHit: Infinity,
    attack: null,
    weapon: "club",
    crash: null,
    fightingBack: null,
    fightingBackSteps: 0,
    attackCooldownSteps: 0,
    busting: null,
    standingBySteps: 0,
    pullingOverTo: null,
    near: false,
    following: false,
    followingSteps: 0,
  }));
}

/** Where a riding cop wants to go this step: how fast, and along which line. */
export interface CopIntent {
  /** Metres per second along the track. */
  readonly speed: number;
  /** The offset to steer for, metres right of the centreline. */
  readonly line: number;
  /** Whether the cop is in a hurry, as when it is out to bust someone: it changes speed and line more briskly. */
  readonly hurrying?: boolean;
  /** The hardest it brakes (m/s²), if gentler than a cop can. */
  readonly braking?: number;
}

/** Cops ride in the inner of the two lanes that run in the race direction, this many metres right of the centreline. */
const PATROL_LINE = 1.5;
/** Cops ride a faster bike than the riders', and hold their line through bends with little steering to spare. */
const COP_LIMITS: BendLimits = { topSpeed: TUNING.cops.topSpeed, grip: 0.95, braking: 16 };
/**
 * A cop following the player rides about this many seconds behind them: further back the faster they ride, far
 * enough that a rider who crashes in front of it and runs straight back to their bike usually gets away...
 */
const FOLLOW_SECONDS = 1.5;
/** ...faster than them by this many m/s for every metre it is further back, flat out if need be, or slower for every metre nearer... */
const FOLLOW_GAIN = 1;
/** ...but no more than this many m/s slower. */
const FOLLOW_MOST_EASING = 20;
/** A cop holding back keeps about this many metres behind the player, well out of their way... */
const HOLD_BACK_GAP = 400;
/** ...and rather than ride slower than this (m/s) in the race's lanes to keep that far back, it pulls over onto the shoulder and waits. */
const HOLD_BACK_SLOWEST = 10;

/** Cops pull away hard, at up to this many m/s²... */
const ACCELERATION = 14;
/** ...brake as hard as this (m/s²)... */
const BRAKING = 30;
/** ...and settle on the speed they want this quickly (1/s), or this quickly in a hurry. */
const SPEED_RESPONSE = 4;
const HURRIED_SPEED_RESPONSE = 8;
/** A cop rides back down the road, to a crashed rider behind it, speeding up to its arrest pace at this many m/s². */
const BACK_ACCELERATION = 4;
/** A cop riding to bust a crashed rider pulls up this many metres to their side, nearer the middle of the road... */
const PULL_UP_BESIDE = 1.2;
/** ...slowing as it gets there to stop by them, as if braking at this rate (m/s²). */
const PULL_UP_BRAKING = 12;
/** The arrest pace (m/s): the fastest a cop rides to a crashed rider to bust them, either way along the road. */
const ARREST_PACE = TUNING.cops.arrestPace;

/**
 * Where a cop on patrol rides: behind the player, `FOLLOW_SECONDS` back
 * while it is following them, coming up to one who stops, or else
 * `HOLD_BACK_GAP` metres back, well out of their way. Further back than that, it rides faster than
 * them, flat out if need be, up to its top speed, to catch them up; nearer,
 * it eases off to let them get ahead. It keeps to its lane, finding its way
 * around the riders on the road (`field`, the motions of everyone on their
 * bikes) and the cars and obstacles on it as opponents do, hurrying out of
 * the way of one it is about to run into.
 */
function patrolIntent(
  me: Readonly<Motion>,
  player: Moving,
  following: boolean,
  track: Track,
  field: readonly Readonly<Motion>[],
  cops: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): CopIntent {
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const safe = safeSpeedAt(track, me.distance + me.speed * BRAKING_LEAD, COP_LIMITS);
  const behind = player.distance - me.distance;
  const gap = following ? FOLLOW_SECONDS * Math.max(0, player.speed) : HOLD_BACK_GAP;
  const speed = Math.min(safe, player.speed + Math.max(-FOLLOW_MOST_EASING, FOLLOW_GAIN * (behind - gap)));
  // It squeezes past only on the road, and never pulls across the path of a rider or a car coming up behind it.
  const way = copsWayAround(me, field, cops, carsAndObstacles);
  const { line, holdBehind, evading } = lineAround(me, PATROL_LINE, field, carsAndObstacles, edge, edge, way);
  return { speed: Math.min(clamp(speed, 0, TUNING.cops.topSpeed), holdBehind), line, hurrying: evading };
}

/** A cop moving across the road looks this many seconds behind it. */
const LOOK_BEHIND = 2;
/** A cop rolls backwards only with at least this many metres clear behind it in its path, so as never to back into anyone or anything there. */
const ROOM_BEHIND = 0.5;

/** Half a bike's length and width (metres). */
const BIKE_HALF_LENGTH = BIKE_LENGTH / 2;
const BIKE_HALF_WIDTH = BIKE_WIDTH / 2;

/** A rider's bike, another cop's, a car or an obstacle behind a cop. */
interface Behind {
  /** How far its front is behind the cop's back (metres): less than nothing, by up to a bike's length, if they overlap. */
  readonly gap: number;
  /** How fast it comes on along the track (m/s). */
  readonly velocity: number;
  /** The offsets it takes up, from left to right: a car changing lanes, from where it is to the lane it is moving over to. */
  readonly left: number;
  readonly right: number;
  /** How hard it brakes (m/s²) for what is in its way: a rider's bike as an opponent plans to, a cop's as hard as a cop can, a car as the traffic does. */
  readonly braking: number;
}

/**
 * Everyone on a bike (`field`, with the `cops` among them), and every car and
 * obstacle on the road (`carsAndObstacles`) but for the cars coming the other
 * way, that is behind a cop at `me`, or no more than a bike's length in front
 * of its back.
 */
function behindTheCop(
  me: Readonly<Motion>,
  field: readonly Readonly<Motion>[],
  cops: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): Behind[] {
  const behind: Behind[] = [];
  const add = (distance: number, halfLength: number, velocity: number, left: number, right: number, braking: number) => {
    const gap = me.distance - distance - halfLength - BIKE_HALF_LENGTH;
    if (gap > -BIKE_LENGTH) behind.push({ gap, velocity, left, right, braking });
  };
  for (const other of field) {
    const braking = cops.includes(other) ? BRAKING : PLANNED_BRAKING;
    if (other !== me) add(other.distance, BIKE_HALF_LENGTH, other.speed, other.offset - BIKE_HALF_WIDTH, other.offset + BIKE_HALF_WIDTH, braking);
  }
  for (const thing of carsAndObstacles) {
    const [left, right] = [Math.min(thing.offset, thing.movingTo) - thing.halfWidth, Math.max(thing.offset, thing.movingTo) + thing.halfWidth];
    if (thing.velocity >= 0) add(thing.distance, thing.halfLength, thing.velocity, left, right, CAR_BRAKING);
  }
  return behind;
}

/** Those of `behind` in the path of a bike anywhere between the offsets `from` and `to`. */
function inThePath(behind: readonly Behind[], from: number, to: number): Behind[] {
  return behind.filter(({ left, right }) => right > from - BIKE_HALF_WIDTH && left < to + BIKE_HALF_WIDTH);
}

/**
 * Whether one of those `behind` a cop at `me`, coming up behind it, would get
 * to it within `LOOK_BEHIND` anywhere between the offsets `from` and `to`.
 */
function comingUpBehind(me: Readonly<Motion>, behind: readonly Behind[], from: number, to: number): boolean {
  return behind.some(({ gap, velocity, left, right }) => {
    const closing = velocity - me.speed;
    return closing > 0 && Math.max(0, gap) < closing * LOOK_BEHIND && right > from && left < to;
  });
}

/**
 * The line a cop at `me` takes when it wants to go to `line`: that line, or,
 * while one of those `behind` it, coming up behind it, would get to it within
 * `LOOK_BEHIND` in the offsets it would move across, the line it is on, so
 * that it never pulls across their path. One in its path already doesn't keep
 * it from moving out of their way, away from the middle of their path.
 */
function lookingBehind(me: Readonly<Motion>, line: number, behind: readonly Behind[]): number {
  const across = line - me.offset;
  if (Math.abs(across) < BIKE_HALF_WIDTH) return line;
  const [from, to] = across > 0 ? [me.offset + BIKE_HALF_WIDTH, line + BIKE_HALF_WIDTH] : [line - BIKE_HALF_WIDTH, me.offset - BIKE_HALF_WIDTH];
  const inItsPath = new Set(inThePath(behind, me.offset, me.offset));
  // Their middle no more than a centimetre over on the side it moves to, as when it rides right in the middle of it.
  const outOfTheirWay = (them: Behind) => inItsPath.has(them) && Math.sign(across) * ((them.left + them.right) / 2 - me.offset) < 0.01;
  return comingUpBehind(me, behind.filter((them) => !outOfTheirWay(them)), from, to) ? me.offset : line;
}

/**
 * How a cop at `me`, with those `behind` it, finds its way around (see
 * `lineAround`): never pulling across the path of one coming up behind it,
 * and with room to roll back only with `ROOM_BEHIND` clear behind it in its
 * path.
 */
function aCopsWay(me: Readonly<Motion>, behind: readonly Behind[]): ACopsWay {
  return {
    keepTo: (line) => lookingBehind(me, line, behind),
    roomBehind: inThePath(behind, me.offset, me.offset).every(({ gap }) => gap >= ROOM_BEHIND),
  };
}

/**
 * How a cop at `me` finds its way around (see `lineAround`) among everyone on
 * a bike (`field`, with the `cops` among them) and the cars and obstacles on
 * the road (`carsAndObstacles`): as `aCopsWay` says. Exported for the Race
 * module's tests, which ask it directly where a cop would ride.
 */
export function copsWayAround(
  me: Readonly<Motion>,
  field: readonly Readonly<Motion>[],
  cops: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): ACopsWay {
  return aCopsWay(me, behindTheCop(me, field, cops, carsAndObstacles));
}

/**
 * The hardest a cop at `me` brakes (m/s²), slowing down to `slowingTo` m/s
 * along the track: no harder than lets those `behind` it in its path, braking
 * as they do for what is in their way, slow down to that speed short of it,
 * though always as hard as that if need be; undefined, as hard as a cop can, with nobody there
 * that braking hard would bring up to it, or when it is braking to stop
 * rolling backwards.
 */
function brakingFor(me: Readonly<Motion>, slowingTo: number, behind: readonly Behind[]): number | undefined {
  return brakingAhead(me, slowingTo, inThePath(behind, me.offset, me.offset));
}

/** The hardest a cop at `me` brakes (m/s²), slowing down to `slowingTo` m/s, in front of `them` (see `brakingFor`). */
function brakingAhead(me: Readonly<Motion>, slowingTo: number, them: readonly Behind[]): number | undefined {
  if (me.speed <= 0) return undefined;
  const slowed = Math.max(0, Math.min(me.speed, slowingTo));
  let hardest = BRAKING;
  for (const { gap, velocity, braking } of them) {
    if (velocity <= slowed) continue;
    // Slowing down to that speed as they can, they would close on it by more than the gap between them, were it down
    // to it already: by this much (m), which it must keep ahead of them by, slowing down to it no harder than `hardest`.
    const short = (velocity - slowed) ** 2 / (2 * braking) - Math.max(0, gap);
    if (short > 0) hardest = Math.min(hardest, Math.max(braking, (me.speed - slowed) ** 2 / (2 * short)));
  }
  return hardest < BRAKING ? hardest : undefined;
}

/**
 * How fast a cop at `me` rides back down the road to `line` (m/s): no faster
 * than lets it pull up `ROOM_BEHIND` short of those `behind` it in its path,
 * were they to stand still, and not at all while one of them comes on and
 * would get to it within `LOOK_BEHIND`; at most its arrest pace.
 */
function ridingBack(me: Readonly<Motion>, line: number, behind: readonly Behind[]): number {
  let fastest: number = ARREST_PACE;
  for (const { gap, velocity } of inThePath(behind, Math.min(me.offset, line), Math.max(me.offset, line))) {
    const comingOn = velocity > 0 && Math.max(0, gap) < velocity * LOOK_BEHIND;
    fastest = Math.min(fastest, comingOn ? 0 : Math.sqrt(2 * PULL_UP_BRAKING * Math.max(0, gap - ROOM_BEHIND)));
  }
  return fastest;
}

/** Making way for those behind it, a cop gets this many metres clear of their path, sideways... */
const MAKING_WAY = 0.3;
/**
 * ...and steers for a line at least this many metres to that side while it is
 * still in their path, so as to steer as fast as it can: steering briskly for
 * a line this far off, or further, takes a bike sideways as fast as it can. It
 * steers for one this far off past a nearer line it wants only when that isn't
 * against the way it is steering, and only where that line is more than a step
 * that fast away or a step that fast takes it out of their path (see
 * `bustingIntent`).
 */
const OUT_OF_THE_WAY = EVASIVE_SPEED / EVASIVE_RESPONSE;

/**
 * The way a cop at `me`, slowing down to `slowingTo` m/s and needing to brake
 * `needs` m/s² hard to do so in time, takes when it wants `line`, or else
 * `otherwise` (see `lineAround`, as `route` takes it there): the first of them
 * it can take, where those `behind` it in its path let it brake that hard all
 * the way there; or else the first line, nearest `line` and then nearer the
 * middle of the road, `MAKING_WAY` clear of the path of one of them that would
 * keep it from braking that hard, that it can take and where they let it all
 * the way there; or else the first of all those that, as far as it gets there,
 * lets it brake that hard; or else, of all of them, the one that, as far as it
 * gets there, lets it brake hardest. On its way to a line, those whose path it
 * moves into or across must let it brake that hard, but for one whose path it
 * is in already and moves out of, away from the middle of it (see `brakingFor`).
 * Lines stay within `edge`.
 */
function makingWay(
  me: Readonly<Motion>,
  line: number,
  otherwise: number,
  slowingTo: number,
  needs: number,
  behind: readonly Behind[],
  edge: number,
  route: (line: number) => ReturnType<typeof lineAround>,
): ReturnType<typeof lineAround> {
  const inItsPath = inThePath(behind, me.offset, me.offset);
  const brakingTowards = (towards: number) => {
    const across = inThePath(behind, Math.min(me.offset, towards), Math.max(me.offset, towards));
    const leaving = (them: Behind) =>
      inItsPath.includes(them) && inThePath([them], towards, towards).length === 0 && Math.sign(towards - me.offset) * ((them.left + them.right) / 2 - me.offset) < 0.01;
    return brakingAhead(me, slowingTo, across.filter((them) => !leaving(them))) ?? BRAKING;
  };
  const clearOf = inThePath(behind, Math.min(me.offset, line), Math.max(me.offset, line))
    .filter(({ velocity }) => velocity > slowingTo)
    .flatMap(({ left, right }) => [left - BIKE_HALF_WIDTH - MAKING_WAY, right + BIKE_HALF_WIDTH + MAKING_WAY])
    .filter((offset) => Math.abs(offset) <= edge)
    .sort((a, b) => Math.abs(a - line) - Math.abs(b - line) || Math.abs(a) - Math.abs(b));
  const ways = [line, otherwise, ...clearOf].map((towards) => ({ towards, way: route(towards) }));
  const braking = (offset: number) => brakingTowards(offset) >= needs;
  const hardest = ways.reduce((best, way) => (brakingTowards(way.way.line) > brakingTowards(best.way.line) ? way : best));
  return (
    ways.find(({ towards, way }) => braking(towards) && way.line === towards) ??
    ways.find(({ towards, way }) => braking(towards) && braking(way.line)) ??
    hardest
  ).way;
}

/**
 * Where a cop rides to bust a crashed rider, who is at `rider` (tumbling along
 * the road or on foot): to them, braking down to the arrest pace at once and
 * riding no faster all the way, and slowing as it gets there to pull up beside
 * them, on the side nearer the middle of the road. So a rider who crashes close
 * in front of a cop is caught, and one who crashes with it following at its
 * usual gap gets back on their bike first if they run straight back to it. It
 * brakes no harder than one coming up behind it in its path can, and pulls up
 * on their other side when it can't get to the nearer one as it is, or would
 * brake there harder than that; should even that take it past them, it first
 * gets clear of that one's path, steering out of it as fast as it can: for a
 * line it wants nearer than `OUT_OF_THE_WAY`, it steers for one that far off,
 * past it, only when that isn't against the way it is steering, and only where
 * the line it wants is more than a step that fast away or a step that fast
 * takes it out of their path; on a line still in their path within such a
 * step, it holds that line rather than shake from side to side. It never moves
 * into or across the path of another who would keep it from braking hard
 * enough, unless every line would; then it takes the one that lets it brake
 * hardest (see `makingWay`). Once past them, it gets out of the path of whoever
 * keeps it from braking as hard as it can before it pulls up beside them. If
 * they are behind it, it stops and rides back down the road to them, holding
 * back for anyone or anything behind it in its path (see `ridingBack`). It
 * finds its way around the riders on the road (`field`, the motions of everyone
 * on a bike) and the cars and obstacles on it as on patrol, and never pulls
 * across the path of one coming up behind it. Offsets stay within `edge`.
 */
function bustingIntent(
  me: Readonly<Motion>,
  rider: Moving,
  field: readonly Readonly<Motion>[],
  cops: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
  edge: number,
): CopIntent {
  const gap = rider.distance - me.distance;
  const pullingUp = rider.speed + Math.sign(gap) * Math.sqrt(2 * PULL_UP_BRAKING * Math.abs(gap));
  const side = rider.offset >= 0 ? 1 : -1;
  const [beside, otherSide] = [-side, side].map((towards) => clamp(rider.offset + towards * PULL_UP_BESIDE, -edge, edge));
  const pace = clamp(pullingUp, -ARREST_PACE, ARREST_PACE);
  const behind = behindTheCop(me, field, cops, carsAndObstacles);
  // Braking down to its pace before it gets to them takes braking this hard (m/s²), or as hard as it can, which those
  // behind it in its path may not let it do there: it makes way for them first. Past them, it needs to stop as hard as
  // it can, out of their way, before it rides back to them.
  const needs = gap > 0 ? Math.min(BRAKING, (me.speed ** 2 - pace ** 2) / (2 * gap)) : BRAKING;
  const way = aCopsWay(me, behind);
  // It squeezes past out onto the shoulder if need be, as far as `edge`.
  const route = (towards: number) => lineAround(me, towards, field, carsAndObstacles, edge, edge, way);
  const { line, holdBehind } = makingWay(me, beside, otherSide, pace, needs, behind, edge, route);
  const speed = pace > 0 ? Math.min(pace, holdBehind) : Math.max(pace, -ridingBack(me, line, behind));
  const braking = brakingFor(me, speed, behind);
  // Kept from braking as hard as it needs to by one in its path, it steers out of it as fast as it can: for a line nearer
  // than `OUT_OF_THE_WAY`, it steers for one that far off, past it, only when that isn't against the way it is steering,
  // and only where its line is more than a step that fast away or a step that fast takes it out of their path. At a line
  // still in their path within such a step it holds it, rather than steer flat out past it one way and then the other.
  const across = line - me.offset;
  const aStep = Math.min(EVASIVE_SPEED, maxSidewaysSpeed(Math.abs(me.speed))) * STEP_SECONDS;
  const outInAStep = () => (brakingFor({ ...me, offset: me.offset + Math.sign(across) * aStep }, speed, behind) ?? BRAKING) >= needs;
  const held =
    (braking ?? BRAKING) < needs &&
    Math.abs(across) < OUT_OF_THE_WAY &&
    across !== 0 &&
    Math.sign(across) !== -Math.sign(me.steering) &&
    (Math.abs(across) > aStep || outInAStep());
  return { speed, line: held ? me.offset + Math.sign(across) * OUT_OF_THE_WAY : line, hurrying: true, braking };
}

/** A cop fighting back swings its club about once every this many seconds. */
const COP_ATTACK_EVERY_SECONDS = 1;

/**
 * Where a cop rides to fight back against the rider who hit it, who is at
 * `rider`: level with them and to their side, within the reach of its club,
 * as an opponent rides up to fight (`levelWith`), and no faster than it can
 * safely go. It finds its way around the riders on the road (`field`, the
 * motions of everyone on their bikes) and the cars and obstacles on it as on
 * patrol, never pulls across the path of one coming up behind it, and brakes
 * no harder than one coming up behind it in its path can.
 */
function fightingBackIntent(
  me: Readonly<Motion>,
  rider: Moving,
  track: Track,
  field: readonly Readonly<Motion>[],
  cops: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): CopIntent {
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const level = levelWith(me, rider, edge);
  const behind = behindTheCop(me, field, cops, carsAndObstacles);
  // It squeezes past only on the road.
  const { line, holdBehind } = lineAround(me, level.line, field, carsAndObstacles, edge, edge, aCopsWay(me, behind));
  const safe = safeSpeedAt(track, me.distance + me.speed * BRAKING_LEAD, COP_LIMITS);
  const speed = Math.min(clamp(Math.min(level.speed, safe), 0, TUNING.cops.topSpeed), holdBehind);
  return { speed, line, hurrying: true, braking: brakingFor(me, speed, behind) };
}

/** A cop pulling over, or standing by, creeps along at this speed (m/s) until it is on the shoulder, since a bike can't move sideways while it stands still. */
const CREEP = 3;

/**
 * Where a cop rides to pull over, or to stand by a rider it has busted: onto
 * the shoulder on the `side` of the road it set off for, its bike clear of the
 * road, out of the field's way, braking at once and creeping across at `CREEP`
 * if need be; then it stops there. It finds its way there around the riders on
 * the road (`field`, the motions of everyone on a bike) and the cars and
 * obstacles on it as on patrol, never pulls across the path of one coming up
 * behind it, and brakes no harder than one coming up behind it in its path can.
 */
function pullingOverIntent(
  me: Readonly<Motion>,
  side: Side,
  track: Track,
  field: readonly Readonly<Motion>[],
  cops: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): CopIntent {
  const shoulder = side * (track.roadHalfWidth + BIKE_WIDTH);
  const onTheShoulder = side * me.offset >= track.roadHalfWidth + BIKE_WIDTH / 2;
  const behind = behindTheCop(me, field, cops, carsAndObstacles);
  // It squeezes past out onto the shoulder if need be, as far as the line it pulls over to.
  const { line, holdBehind } = lineAround(me, shoulder, field, carsAndObstacles, Math.abs(shoulder), Math.abs(shoulder), aCopsWay(me, behind));
  const speed = onTheShoulder ? 0 : Math.min(CREEP, holdBehind);
  return { speed, line, hurrying: true, braking: brakingFor(me, speed, behind) };
}

/**
 * Moves a riding cop by a step towards the speed and line it wants: forwards
 * at up to its top speed, or back down the road at no more than the arrest
 * pace. Braking stops the bike before it can go the other way. Like any bike,
 * it can't move sideways while it stands still. Offsets stay within `edge`.
 */
function moveCop(motion: Motion, intent: CopIntent, edge: number): void {
  const wanted = clamp(intent.speed, -ARREST_PACE, TUNING.cops.topSpeed);
  const change = (intent.hurrying ? HURRIED_SPEED_RESPONSE : SPEED_RESPONSE) * (wanted - motion.speed);
  const braking = motion.speed !== 0 && Math.sign(change) !== Math.sign(motion.speed);
  const most = braking ? (intent.braking ?? BRAKING) : change > 0 ? ACCELERATION : BACK_ACCELERATION;
  const before = motion.speed;
  motion.speed += clamp(change, -most, most) * STEP_SECONDS;
  if (braking && Math.sign(motion.speed) !== Math.sign(before)) motion.speed = 0;
  // It steers for its line as an opponent does, briskly in a hurry, as far as the bike's steering allows.
  const reach = maxSidewaysSpeed(Math.abs(motion.speed));
  motion.steering = clamp(sidewaysTowards(intent.line, motion.offset, intent.hurrying === true), -reach, reach);
  motion.distance += motion.speed * STEP_SECONDS;
  motion.offset = clamp(motion.offset + (motion.steering + motion.shove + motion.kickShove) * STEP_SECONDS, -edge, edge);
  motion.shove *= Math.exp(-TUNING.shoveDecay * STEP_SECONDS);
  motion.kickShove *= Math.exp(-TUNING.kickShoveDecay * STEP_SECONDS);
}

/** A cop follows the player for this many seconds near them after anything last happened to it (a crash it rode to, a fight)... */
const FOLLOWING_STEPS = stepsIn(30);
/** ...then falls back, and no cop comes to follow them again for this many seconds. */
const BREAK_STEPS = stepsIn(80);

/** The cops' turns at following the player: one at a time, with a break between turns. */
export interface Rota {
  /** Steps until a cop comes to follow the player again. */
  breakSteps: number;
}

/**
 * Moves the cops' turns at following the player on by a step. The cop
 * following them follows them for `FOLLOWING_STEPS` near them (as the race
 * last said), counted from when it was last `busy` (riding to bust someone,
 * fighting back or standing by a rider it busted), then falls back; so does
 * one knocked out of the race. Either way
 * a break follows, and then the cop in the race nearest the player comes to
 * follow them. The first cop to join the race follows them at once; others
 * hold back while it does, or during a break.
 */
function takeTurns(cops: readonly Cop[], rota: Rota, player: Moving, busy: (cop: Cop) => boolean): void {
  for (const cop of cops) {
    if (!cop.following) continue;
    if (cop.status !== "riding") cop.following = false;
    else if (busy(cop)) cop.followingSteps = FOLLOWING_STEPS;
    else if (cop.near && --cop.followingSteps <= 0) cop.following = false;
    if (!cop.following) rota.breakSteps = BREAK_STEPS;
  }
  if (cops.some((cop) => cop.following)) return;
  if (rota.breakSteps > 0) {
    rota.breakSteps--;
    return;
  }
  const next = cops
    .filter((cop) => cop.status === "riding")
    .sort((a, b) => Math.abs(a.motion.distance - player.distance) - Math.abs(b.motion.distance - player.distance))[0];
  if (!next) return;
  next.following = true;
  next.followingSteps = FOLLOWING_STEPS;
}

/**
 * What every cop does this step, from where things stand: rides to bust a
 * crashed rider who hasn't got away yet; or fights back against the rider
 * who hit it, riding alongside them and swinging at them when they are
 * within reach; or stands by a rider it has just busted, on the shoulder;
 * or else patrols near the player, pulling over onto the shoulder while the
 * player is down after a crash it isn't riding to. Cops find their way around everyone on a bike, the
 * riders and each other (`everyoneOnABike`), and the cars and obstacles on
 * the road. Returns each cop's intent, or null for a cop not riding in the
 * race.
 */
export function decideCops(
  race: RaceState,
  everyoneOnABike: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): (CopIntent | null)[] {
  const { riders, cops, track, edge } = race;
  letGo(race);
  for (const cop of copsInTheRace(race)) {
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    cop.fightingBackSteps = Math.max(0, cop.fightingBackSteps - 1);
    if (fighting && (cop.fightingBackSteps === 0 || fighting.status !== "racing")) cop.fightingBack = null;
    cop.attackCooldownSteps = Math.max(0, cop.attackCooldownSteps - 1);
    cop.standingBySteps = Math.max(0, cop.standingBySteps - 1);
  }
  for (const cop of copsInTheRace(race)) {
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    if (!fighting || fighting.crash || cop.busting !== null || cop.attack || cop.attackCooldownSteps > 0) continue;
    if (!withinReach(cop.motion, fighting.motion, punchOf(cop))) continue;
    throwAttack(race, cop, "punch");
    cop.attackCooldownSteps = stepsIn(COP_ATTACK_EVERY_SECONDS);
  }
  const player = whereIs(riders[PLAYER]);
  const copsOnBikes = copsInTheRace(race).map((cop) => cop.motion);
  takeTurns(cops, race.rota, player, (cop) => cop.busting !== null || cop.fightingBack !== null || cop.standingBySteps > 0);
  return cops.map((cop) => {
    // A cop keeps the side of the road it pulls over to only while it goes on pulling over.
    const pullingOverTo = cop.pullingOverTo;
    cop.pullingOverTo = null;
    if (cop.status !== "riding") return null;
    if (cop.busting !== null) {
      return bustingIntent(cop.motion, whereIs(riders[cop.busting]), everyoneOnABike, copsOnBikes, carsAndObstacles, edge);
    }
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    if (fighting && !fighting.crash) {
      return fightingBackIntent(cop.motion, fighting.motion, track, everyoneOnABike, copsOnBikes, carsAndObstacles);
    }
    // Standing by a rider it has busted, or on patrol while the player is down, a cop pulls over onto the shoulder;
    // and so does one holding back from a player who rides slowly, or following one it has found itself in front of,
    // as when they get back on their bike after a crash it rode past, rather than slow almost to a stop in the lanes.
    // It pulls over on its side of the road as it sets off, and keeps to that side, even if it has to go round a rider
    // across the middle of the road on its way there.
    const pullingOver = () => {
      cop.pullingOverTo = pullingOverTo ?? (cop.motion.offset >= 0 ? 1 : -1);
      return pullingOverIntent(cop.motion, cop.pullingOverTo, track, everyoneOnABike, copsOnBikes, carsAndObstacles);
    };
    if (cop.standingBySteps > 0 || riders[PLAYER].crash) return pullingOver();
    const patrol = patrolIntent(cop.motion, player, cop.following, track, everyoneOnABike, copsOnBikes, carsAndObstacles);
    const inFront = cop.motion.distance - player.distance > BIKE_LENGTH;
    return (!cop.following || inFront) && patrol.speed < HOLD_BACK_SLOWEST ? pullingOver() : patrol;
  });
}

/**
 * Moves every cop on by a step: a riding cop as it intends (`intents`, by cop
 * id); a waiting cop's bike, bumped, slides to a stop on the shoulder; a
 * knocked-off cop's bike slides to a stop while they tumble, and then they
 * stay where they are.
 */
export function moveCops(race: RaceState, intents: readonly (CopIntent | null)[]): void {
  const { edge } = race;
  race.cops.forEach((cop, index) => {
    const intent = intents[index];
    if (intent) moveCop(cop.motion, intent, edge);
    // A cop's bike parked on the shoulder, bumped, slides to a stop.
    if (cop.status === "waiting") slide(cop.motion, edge);
    // A knocked-off cop's bike slides to a stop while they tumble, and then they stay where they are.
    if (cop.crash) {
      slide(cop.motion, edge);
      carryOn(cop.crash, cop.motion, STAND_STILL, edge);
    }
  });
}

/** Cops waiting on the shoulder join the race once the player, still racing, has passed them. */
export function joinThePlayer(race: RaceState) {
  const player = race.riders[PLAYER];
  if (player.status !== "racing") return;
  for (const cop of race.cops) {
    if (cop.status === "waiting" && whereIs(player).distance >= cop.motion.distance) cop.status = "riding";
  }
}

/** Says which cops have come near the player, and which have gone: cops in the race within their alert range of the player. */
export function alertThePlayer(race: RaceState) {
  for (const cop of race.cops) {
    const near = cop.status === "riding" && apart(cop.motion, whereIs(race.riders[PLAYER])) <= TUNING.cops.alertRange;
    if (near === cop.near) continue;
    cop.near = near;
    race.events.push({ type: near ? "cop-near" : "cop-gone", cop: cop.id });
  }
}
