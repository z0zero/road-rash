import type { Crash } from "./crashing";
import type { CopId, RiderId } from "./events";
import type { Attack, Weapon } from "./fighting";
import type { Footprint } from "./footprint";
import { lineAround, safeSpeedAt, type BendLimits } from "./opponent-riding";
import { clamp, maxSidewaysSpeed, type Motion } from "./riding";
import { STEP_SECONDS } from "./steps";
import type { Track } from "./track";
import { TUNING } from "./tuning";

/** Where a cop is in the race: waiting on the shoulder for the player to pass, riding in the race, or knocked off and out of it. */
export type CopStatus = "waiting" | "riding" | "knocked-off";

/** A fresh cop's stamina, which runs down to 0 as a rider's does from 100. */
export const COP_FULL_STAMINA: number = TUNING.cops.fullStamina;

/** The cops, in cop-id order: original names, none taken from Road Rash's rosters. */
const COP_NAMES = ["Sergeant Pike", "Deputy Gale"];

/** A cop on a motorcycle, in track space like the riders. */
export interface Cop {
  readonly kind: "cop";
  readonly id: CopId;
  readonly name: string;
  /** The bike's motion, which is the cop's too while they ride it. */
  readonly motion: Motion;
  status: CopStatus;
  stamina: number;
  /** Steps since the cop was last hit (Infinity if never). */
  stepsSinceHit: number;
  /** The attack the cop is making, or null. */
  attack: Attack | null;
  /** The weapon the cop holds, or null: every cop carries a club. */
  weapon: Weapon | null;
  /** Null while the cop is on their bike; how they came off it once knocked off. */
  crash: Crash | null;
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
  /** Whether the cop is in the race near the player, as the race last said with cop-near or cop-gone. */
  near: boolean;
}

/** The cops, each waiting on the right-hand shoulder at its waiting point, fresh. */
export function lineUpCops(track: Track): Cop[] {
  const shoulder = track.roadHalfWidth + track.shoulderWidth / 2;
  return TUNING.cops.waitingPoints.map((along, id) => ({
    kind: "cop",
    id,
    name: COP_NAMES[id],
    motion: { distance: track.startDistance + along, offset: shoulder, speed: 0, steering: 0, shove: 0 },
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
    near: false,
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
}

/** Where someone is and how fast they are going along the track. */
export interface Place {
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres right of the centreline. */
  readonly offset: number;
  /** Metres per second along the track. */
  readonly speed: number;
}

/** Cops ride in the inner of the two lanes that run in the race direction, this many metres right of the centreline. */
const PATROL_LINE = 1.5;
/** Cops keep their line at least this far inside the road's edges (metres). */
const EDGE_MARGIN = 0.8;
/** Cops ride a faster bike than the riders', and hold their line through bends with little steering to spare. */
const COP_LIMITS: BendLimits = { topSpeed: TUNING.cops.topSpeed, grip: 0.95, braking: 16 };
/** Cops slow for what lies this many seconds ahead, to allow for the time braking takes to bite. */
const BRAKING_LEAD = 0.3;
/** On patrol, a cop rides at this share of the fastest it can safely go... */
const PATROL_PACE = 0.93;
/** ...while it is no more than this many metres behind the player; further behind, it rides flat out to catch them up... */
const PATROL_BEHIND = 60;
/** ...and while it is no more than this many metres ahead of them; further ahead, it eases off to let them come up... */
const PATROL_AHEAD = 20;
/** ...riding slower than them by this many metres per second for every metre beyond that... */
const PATROL_EASING = 0.5;
/** ...up to this many. */
const PATROL_MOST_EASING = 20;

/** Cops pull away hard, at up to this many m/s²... */
const ACCELERATION = 14;
/** ...brake as hard as this (m/s²)... */
const BRAKING = 30;
/** ...and settle on the speed they want this quickly (1/s), or this quickly in a hurry. */
const SPEED_RESPONSE = 4;
const HURRIED_SPEED_RESPONSE = 8;
/** A cop rides back down the road, to a crashed rider behind it, gingerly: no faster than this (m/s)... */
const BACK_SPEED = 8;
/** ...speeding up to it at this many m/s². */
const BACK_ACCELERATION = 4;
/** Cops steer for the line they want this quickly (1/s)... */
const LINE_RESPONSE = 1.5;
/** ...at up to this many metres per second sideways; in a hurry, quicker still, as far as the bike's steering allows. */
const LINE_CHANGE_SPEED = 4;
const HURRIED_LINE_RESPONSE = 4;
const HURRIED_LINE_CHANGE_SPEED = 7;
/** A cop riding to bust a crashed rider pulls up this many metres to their side, nearer the middle of the road... */
const PULL_UP_BESIDE = 1.2;
/** ...slowing as it gets there to stop by them, as if braking at this rate (m/s²). */
const PULL_UP_BRAKING = 12;

/**
 * Where a cop on patrol rides: near the player, who can't outride it. It
 * rides at its own pace, a little short of flat out, while it is between
 * `PATROL_BEHIND` metres behind the player and `PATROL_AHEAD` ahead, so it
 * drops back behind a player who rides fast and comes past one who rides
 * slowly. Further behind, it rides flat out, up to its top speed, to catch
 * them up; further ahead, it eases off to let them come up. It keeps to its
 * lane, finding its way around the riders on the road (`field`, the motions
 * of everyone on their bikes) and the cars and obstacles on it as opponents
 * do, hurrying out of the way of one it is about to run into.
 */
export function patrolIntent(
  me: Readonly<Motion>,
  player: Place,
  track: Track,
  field: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): CopIntent {
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const safe = safeSpeedAt(track, me.distance + me.speed * BRAKING_LEAD, COP_LIMITS);
  const ahead = me.distance - player.distance;
  let speed = PATROL_PACE * safe;
  if (-ahead > PATROL_BEHIND) speed = safe;
  else if (ahead > PATROL_AHEAD) {
    speed = Math.min(speed, player.speed - Math.min(PATROL_MOST_EASING, PATROL_EASING * (ahead - PATROL_AHEAD)));
  }
  const { line, holdBehind, evading } = lineAround(me, PATROL_LINE, field, carsAndObstacles, edge);
  return { speed: clamp(Math.min(speed, holdBehind), 0, TUNING.cops.topSpeed), line, hurrying: evading };
}

/**
 * Where a cop rides to bust a crashed rider, who is at `rider` (tumbling
 * along the road or on foot): to them, slowing as it gets there to pull up
 * beside them, on the side nearer the middle of the road. If they are behind
 * it, it stops and rides back down the road to them. Offsets stay within
 * `edge`.
 */
export function bustingIntent(me: Readonly<Motion>, rider: Place, edge: number): CopIntent {
  const gap = rider.distance - me.distance;
  const speed = rider.speed + Math.sign(gap) * Math.sqrt(2 * PULL_UP_BRAKING * Math.abs(gap));
  const line = rider.offset - (rider.offset >= 0 ? 1 : -1) * PULL_UP_BESIDE;
  return { speed, line: clamp(line, -edge, edge), hurrying: true };
}

/** A cop fighting back throws an attack at most once every this many seconds. */
export const COP_ATTACK_EVERY_SECONDS = 2.5;
/** A cop fighting back rides this many metres to the side of the rider it fights... */
const FIGHTING_GAP = 1.4;
/** ...closing in on them along the track at this many metres per second for every metre between them... */
const LEVEL_GAIN = 0.8;
/** ...but no faster than this (m/s). */
const MAX_CLOSING = 5;

/**
 * Where a cop rides to fight back against the rider who hit it, who is at
 * `rider`: level with them, `FIGHTING_GAP` to their side (the side it is on,
 * unless that is off the road), within the reach of its club, and no faster
 * than it can safely go. It finds its way around the riders on the road
 * (`field`, the motions of everyone on their bikes) and the cars and
 * obstacles on it as on patrol.
 */
export function fightingBackIntent(
  me: Readonly<Motion>,
  rider: Place,
  track: Track,
  field: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): CopIntent {
  const edge = track.roadHalfWidth - EDGE_MARGIN;
  const side = me.offset >= rider.offset ? 1 : -1;
  const beside = rider.offset + side * FIGHTING_GAP;
  const wanted = clamp(Math.abs(beside) <= edge ? beside : rider.offset - side * FIGHTING_GAP, -edge, edge);
  const { line, holdBehind } = lineAround(me, wanted, field, carsAndObstacles, edge);
  const closing = clamp(LEVEL_GAIN * (rider.distance - me.distance), -MAX_CLOSING, MAX_CLOSING);
  const safe = safeSpeedAt(track, me.distance + me.speed * BRAKING_LEAD, COP_LIMITS);
  return { speed: clamp(Math.min(rider.speed + closing, safe, holdBehind), 0, TUNING.cops.topSpeed), line, hurrying: true };
}

/** A cop standing by a rider it has busted: it stops where it is. */
export function standingByIntent(me: Readonly<Motion>): CopIntent {
  return { speed: 0, line: me.offset };
}

/**
 * Moves a riding cop by a step towards the speed and line it wants: forwards
 * at up to its top speed, or back down the road, slowly. Braking stops the
 * bike before it can go the other way. Like any bike, it can't move sideways
 * while it stands still. Offsets stay within `edge`.
 */
export function moveCop(motion: Motion, intent: CopIntent, edge: number): void {
  const wanted = clamp(intent.speed, -BACK_SPEED, TUNING.cops.topSpeed);
  const change = (intent.hurrying ? HURRIED_SPEED_RESPONSE : SPEED_RESPONSE) * (wanted - motion.speed);
  const braking = motion.speed !== 0 && Math.sign(change) !== Math.sign(motion.speed);
  const most = braking ? BRAKING : change > 0 ? ACCELERATION : BACK_ACCELERATION;
  const before = motion.speed;
  motion.speed += clamp(change, -most, most) * STEP_SECONDS;
  if (braking && Math.sign(motion.speed) !== Math.sign(before)) motion.speed = 0;
  const [response, sideways] = intent.hurrying
    ? [HURRIED_LINE_RESPONSE, HURRIED_LINE_CHANGE_SPEED]
    : [LINE_RESPONSE, LINE_CHANGE_SPEED];
  const reach = Math.min(sideways, maxSidewaysSpeed(Math.abs(motion.speed)));
  motion.steering = clamp(response * (intent.line - motion.offset), -reach, reach);
  motion.distance += motion.speed * STEP_SECONDS;
  motion.offset = clamp(motion.offset + (motion.steering + motion.shove) * STEP_SECONDS, -edge, edge);
  motion.shove *= Math.exp(-TUNING.shoveDecay * STEP_SECONDS);
}
