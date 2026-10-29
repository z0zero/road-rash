import { clamp, type Motion } from "./riding";
import { STEP_SECONDS, stepsIn } from "./steps";
import { TUNING } from "./tuning";

/** Where a crashed rider is in getting back on: tumbling just after the crash, then on foot running back to the bike. */
export type CrashPhase = "tumbling" | "on-foot";

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
  /** Steps since the crash. */
  steps: number;
  readonly body: Body;
  /** How fast the tumble slows the rider (m/s²), so that they come to a stop as it ends. */
  readonly tumbleDeceleration: number;
}

/** Throws a rider off the bike whose motion is `bike`: they leave it at its speed and tumble to a stop. */
export function throwOff(bike: Readonly<Motion>): Crash {
  return {
    phase: "tumbling",
    steps: 0,
    body: { distance: bike.distance, offset: bike.offset, speed: bike.speed, sideways: bike.steering + bike.shove },
    tumbleDeceleration: bike.speed / TUNING.tumbleSeconds,
  };
}

/** Moves a bike nobody is riding on by a step: it slides along the road and grinds to a stop. */
export function slide(bike: Motion, edge: number): void {
  bike.speed = Math.max(0, bike.speed - TUNING.slideDeceleration * STEP_SECONDS);
  bike.distance += bike.speed * STEP_SECONDS;
  bike.offset = clamp(bike.offset + (bike.steering + bike.shove) * STEP_SECONDS, -edge, edge);
  const settle = Math.exp(-TUNING.sideSlideDecay * STEP_SECONDS);
  bike.steering *= settle;
  bike.shove *= settle;
}

/** How a rider on foot is steered: running straight at the bike, turned left or right of it, or stopped by braking. */
export interface OnFootControls {
  /** -1 (turn full left) to 1 (full right). */
  readonly steer: number;
  /** 0 (run) to 1 (stand still). */
  readonly brake: number;
}

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
}

/** Moves a crashed rider on by a step: tumbling to a stop, then on foot, running back to their bike. */
export function carryOn(crash: Crash, bike: Readonly<Motion>, controls: OnFootControls, edge: number): void {
  crash.steps++;
  if (crash.phase === "tumbling") {
    tumble(crash, edge);
    if (crash.steps >= TUMBLE_STEPS) crash.phase = "on-foot";
  } else {
    run(crash.body, bike, controls, edge);
  }
}

function tumble({ body, tumbleDeceleration }: Crash, edge: number) {
  body.speed = Math.max(0, body.speed - tumbleDeceleration * STEP_SECONDS);
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
