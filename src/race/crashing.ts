import { sendCopsTo } from "./busting";
import type { CrashCause } from "./events";
import type { RaceState } from "./race-state";
import { PLAYER, type Rider } from "./riders";
import { clamp, type Motion } from "./riding";
import { STEP_SECONDS, stepsIn } from "./steps";
import { TUNING } from "./tuning";

/**
 * Where a crashed rider is in getting back on: tumbling just after the crash,
 * then on foot running back to the bike; knocked down while they tumble again
 * after a car has run into them on foot, then on foot again.
 */
export type CrashPhase = "tumbling" | "knocked-down" | "on-foot";

/** A rider's own motion while off their bike, in track space. */
export interface Body {
  /** Metres along the centreline. */
  distance: number;
  /** Metres right of the centreline. */
  offset: number;
  /** Metres per second along the track; negative when heading back down it. */
  speed: number;
  /** Metres per second sideways; positive is right. */
  sideways: number;
}

/** A rider thrown off their bike: the bike slides on by itself while the rider tumbles. */
export interface Crash {
  phase: CrashPhase;
  /** Steps since the crash, or since the rider was last knocked down. */
  steps: number;
  readonly body: Body;
}

/** Throws a rider off the bike whose motion is `bike`: they leave it at its speed and tumble to a stop. */
export function throwOff(bike: Readonly<Motion>): Crash {
  return {
    phase: "tumbling",
    steps: 0,
    body: {
      distance: bike.distance,
      offset: bike.offset,
      speed: bike.speed,
      sideways: bike.steering + bike.shove + bike.kickShove,
    },
  };
}

/** Knocks a rider on foot down: they tumble again, thrown along the track at `speed` and sideways at `sideways` (m/s). */
export function knockDown(crash: Crash, speed: number, sideways: number): void {
  crash.phase = "knocked-down";
  crash.steps = 0;
  crash.body.speed = speed;
  crash.body.sideways = sideways;
}

/** Moves a bike nobody is riding on by a step: it slides along the road and grinds to a stop. */
export function slide(bike: Motion, edge: number): void {
  bike.speed = Math.max(0, bike.speed - TUNING.slideDeceleration * STEP_SECONDS);
  bike.distance += bike.speed * STEP_SECONDS;
  bike.offset = clamp(bike.offset + (bike.steering + bike.shove + bike.kickShove) * STEP_SECONDS, -edge, edge);
  // Its sideways slide dies away too, and stops when the bike does.
  const settle = bike.speed > 0 ? Math.exp(-TUNING.sideSlideDecay * STEP_SECONDS) : 0;
  bike.steering *= settle;
  bike.shove *= settle;
  bike.kickShove *= settle;
}

/** How a rider on foot is steered: running straight at the bike, turned left or right of it, or stopped by braking. */
export interface OnFootControls {
  /** -1 (turn full left) to 1 (full right). */
  readonly steer: number;
  /** 0 (run) to 1 (stand still). */
  readonly brake: number;
}

/** Opponents on foot run straight back to their bikes. */
const RUN_STRAIGHT_BACK: OnFootControls = { steer: 0, brake: 0 };

/** A rider whose race is over stays where they are once they are on their feet. */
export const STAND_STILL: OnFootControls = { steer: 0, brake: 1 };

const TUMBLE_STEPS = stepsIn(TUNING.tumbleSeconds);

/** Whether a crashed rider is on foot and close enough to their bike to get back on. */
export function canRemount(crash: Crash, bike: Readonly<Motion>): boolean {
  const { body } = crash;
  return crash.phase === "on-foot" && Math.hypot(bike.distance - body.distance, bike.offset - body.offset) <= TUNING.remountReach;
}

/** Puts a rider back on their bike, which sets off slowly. */
export function remount(bike: Motion): void {
  bike.speed = TUNING.remountSpeed;
  bike.steering = 0;
  bike.shove = 0;
  bike.kickShove = 0;
}

/** Moves a crashed rider on by a step: tumbling to a stop (after a crash or a knock-down), then on foot, running back to their bike. */
export function carryOn(crash: Crash, bike: Readonly<Motion>, controls: OnFootControls, edge: number): void {
  crash.steps++;
  if (crash.phase !== "on-foot") {
    tumble(crash, edge);
    if (crash.steps >= TUMBLE_STEPS) {
      crash.phase = "on-foot";
      crash.body.speed = 0;
      crash.body.sideways = 0;
    }
  } else {
    run(crash.body, bike, controls, edge);
  }
}

/** A tumbling rider slows steadily along the track, either way, so as to come to a stop as the tumble ends. */
function tumble({ body, steps }: Crash, edge: number) {
  body.speed -= body.speed / Math.max(1, TUMBLE_STEPS - steps + 1);
  body.sideways *= Math.exp(-TUNING.sideSlideDecay * STEP_SECONDS);
  move(body, edge);
}

function run(body: Body, bike: Readonly<Motion>, { steer, brake }: OnFootControls, edge: number) {
  const along = bike.distance - body.distance;
  const across = bike.offset - body.offset;
  const heading = Math.atan2(across, along) + clamp(steer, -1, 1) * TUNING.runTurn;
  const speed = TUNING.runSpeed * (1 - clamp(brake, 0, 1));
  body.speed = speed * Math.cos(heading);
  body.sideways = speed * Math.sin(heading);
  move(body, edge);
}

function move(body: Body, edge: number) {
  body.distance += body.speed * STEP_SECONDS;
  body.offset = clamp(body.offset + body.sideways * STEP_SECONDS, -edge, edge);
}

/**
 * Throws a rider off their bike, which loses condition; a bike whose
 * condition runs out is wrecked, and so is the rider's race. A rider who
 * crashes drops their club, which is lost.
 */
export function crash(race: RaceState, rider: Rider, cause: CrashCause, impactSpeed: number) {
  race.events.push({ type: "crash", rider: rider.id, cause, impactSpeed });
  rider.attack = null;
  rider.weapon = null;
  rider.crash = throwOff(rider.motion);
  const loss = TUNING.crashConditionLoss + TUNING.crashConditionLossPerImpactSpeed * impactSpeed;
  rider.condition = Math.max(0, rider.condition - loss);
  if (rider.condition === 0) {
    rider.status = "wrecked";
    race.events.push({ type: "wrecked", rider: rider.id });
    if (rider.id === PLAYER) race.events.push({ type: "player-race-over", outcome: "wrecked" });
  } else {
    sendCopsTo(race, rider);
  }
}

/**
 * Moves a crashed rider on by a step: their bike slides on by itself while
 * they tumble, then run back to it, steered by the player's `input` for the
 * player, straight back for an opponent, and get back on once they reach it.
 * A rider whose race is over stands still once on their feet.
 */
export function runBack(race: RaceState, rider: Rider, input: OnFootControls): void {
  if (!rider.crash) return;
  const { edge } = race;
  slide(rider.motion, edge);
  const onFoot = rider.status !== "racing" ? STAND_STILL : rider.riding ? RUN_STRAIGHT_BACK : input;
  carryOn(rider.crash, rider.motion, onFoot, edge);
  if (rider.status === "racing" && canRemount(rider.crash, rider.motion)) getBackOn(race, rider);
}

/** A rider on foot who has reached their bike rides off on it again, with at least some stamina. */
function getBackOn(race: RaceState, rider: Rider) {
  rider.crash = null;
  remount(rider.motion);
  rider.stamina = Math.max(rider.stamina, TUNING.remountStamina);
  race.events.push({ type: "remounted", rider: rider.id });
}
