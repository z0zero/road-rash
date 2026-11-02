import { sendCopsTo } from "./busting";
import type { CrashCause } from "./events";
import type { Footprint } from "./footprint";
import { copsInTheRace, type RaceState } from "./race-state";
import { isPlayer, whereIs, type Rider } from "./riders";
import { BIKE_LENGTH, BIKE_WIDTH, clamp, type Motion } from "./riding";
import { STEP_SECONDS, stepsIn } from "./steps";
import { apart } from "./track";
import { TUNING } from "./tuning";

/**
 * Where a crashed rider is in getting back on: tumbling just after the crash,
 * then on foot running back to the bike; knocked down while they tumble again
 * after a car has run into them on foot, then on foot again.
 */
export type CrashPhase = "tumbling" | "knocked-down" | "on-foot";

/** A rider on foot takes up about this many metres, along the track and across it. */
export const BODY_SIZE = 0.6;

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
  /** Whether the rider, on foot by their bike, is waiting for a car to go by before getting back on it... */
  waitingForACar: boolean;
  /** ...and for how many steps they have waited so, since they last got to their feet. */
  waitedSteps: number;
}

/** Throws a rider off the bike whose motion is `bike`: they leave it at its speed and tumble to a stop. */
export function throwOff(bike: Readonly<Motion>): Crash {
  return {
    phase: "tumbling",
    steps: 0,
    waitingForACar: false,
    waitedSteps: 0,
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
  crash.waitingForACar = false;
  crash.waitedSteps = 0;
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
function canRemount(crash: Crash, bike: Readonly<Motion>): boolean {
  const { body } = crash;
  return crash.phase === "on-foot" && Math.hypot(bike.distance - body.distance, bike.offset - body.offset) <= TUNING.remountReach;
}

/** A rider at their bike looks this many seconds ahead for a car that would run into them as they ride off on it... */
const LOOKING_OUT_FOR_CARS = 0.5;
/** ...and waits by the bike for it to go by, standing this many metres clear of its side... */
const STANDING_CLEAR = 0.1;
/** ...which a car going by at speed takes a second or less to do... */
const A_CAR_GOING_BY = 1;
/**
 * ...but they wait three seconds at most since they last got to their feet,
 * about as long as one car crawling towards them would keep them, and then
 * get on whatever comes: so a queue of cars crawling past never keeps them
 * there, nor does anything else.
 */
const WAITING_AT_MOST = stepsIn(3);

/** Where a car's way across the road runs, from where it is to the lane it is moving to, from its left side to its right (metres right of the centreline). */
function wayOf(car: Footprint): readonly [number, number] {
  return [Math.min(car.offset, car.movingTo) - car.halfWidth, Math.max(car.offset, car.movingTo) + car.halfWidth];
}

/**
 * The cars, of `cars` (by their footprints), that carried on at their speed
 * for `LOOKING_OUT_FOR_CARS` would run into the bike `bike` if its rider rode
 * off on it now, along the road at `TUNING.remountSpeed`: those whose way
 * takes in the bike's, and that meet it on the way fast enough to crash them,
 * at `TUNING.bumpSpeedLimit` or more. A car standing still over or beside the
 * bike, or crawling along their way in a queue, would only bump them, so it
 * is never one; nor is a cop's bike or another rider's, since in a run-in
 * only the faster of two bikes crashes, never one setting off, and never a
 * cop.
 */
function carsComing(bike: Readonly<Motion>, cars: readonly Footprint[]): Footprint[] {
  return cars.filter((car) => {
    const closing = car.velocity - TUNING.remountSpeed;
    if (Math.abs(closing) < TUNING.bumpSpeedLimit) return false;
    const [left, right] = wayOf(car);
    if (bike.offset + BIKE_WIDTH / 2 <= left || bike.offset - BIKE_WIDTH / 2 >= right) return false;
    // How far its middle is ahead of the bike's now, and once carried on: they meet if they are nose to tail or closer between.
    const now = car.distance - bike.distance;
    const then = now + closing * LOOKING_OUT_FOR_CARS;
    const touching = car.halfLength + BIKE_LENGTH / 2;
    return Math.min(now, then) < touching && Math.max(now, then) > -touching;
  });
}

/**
 * Whether a cop riding to bust `rider`, who is on foot, is near enough to
 * reach them if they waited by their bike for a car to go by: within its
 * busting reach of them, plus as far as it rides in `A_CAR_GOING_BY` at its
 * arrest pace. Then they get on all the same, and chance the car rather
 * than be busted.
 */
function copClose(race: RaceState, rider: Rider): boolean {
  const reach = TUNING.cops.bustingReach + TUNING.cops.arrestPace * A_CAR_GOING_BY;
  return copsInTheRace(race).some((cop) => cop.busting === rider.id && apart(cop.motion, whereIs(rider)) <= reach);
}

/**
 * Moves a rider waiting by their bike (by their `body`) on by a step, while
 * the `coming` cars go by: out of the way of the first whose way takes them
 * in, sideways at a run, the shorter way, unless the road's `edge` leaves no
 * room for them that way, to stand `STANDING_CLEAR` of its side; and
 * otherwise standing still.
 */
function standClear(body: Body, coming: readonly Footprint[], edge: number) {
  body.speed = 0;
  body.sideways = 0;
  for (const car of coming) {
    const [left, right] = wayOf(car);
    const leftOfIt = left - BODY_SIZE / 2 - STANDING_CLEAR;
    const rightOfIt = right + BODY_SIZE / 2 + STANDING_CLEAR;
    if (body.offset <= leftOfIt || body.offset >= rightOfIt) continue;
    const toTheLeft = (body.offset - leftOfIt <= rightOfIt - body.offset && leftOfIt >= -edge) || rightOfIt > edge;
    const clear = toTheLeft ? leftOfIt : rightOfIt;
    body.sideways = clamp((clear - body.offset) / STEP_SECONDS, -TUNING.runSpeed, TUNING.runSpeed);
    break;
  }
  move(body, edge);
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
    if (isPlayer(rider)) race.events.push({ type: "player-race-over", outcome: "wrecked" });
  } else {
    sendCopsTo(race, rider);
  }
}

/**
 * Moves a crashed rider on by a step: their bike slides on by itself while
 * they tumble, then run back to it, steered by the player's `input` for the
 * player, straight back for an opponent, and get back on once they reach it.
 * Unless one of the `cars` (by their footprints) is coming that would run
 * into them as they rode off, and no cop riding to bust them is close as
 * they reach it: then they wait by their bike, out of its way, until no car
 * is coming, or for `WAITING_AT_MOST`, when they go back to it and get on.
 * Once waiting, they wait on, as a car is closest then. A rider whose race
 * is over stands still once on their feet.
 */
export function runBack(race: RaceState, rider: Rider, input: OnFootControls, cars: readonly Footprint[]): void {
  const { crash } = rider;
  if (!crash) return;
  const { edge } = race;
  slide(rider.motion, edge);
  const racing = rider.status === "racing";
  const mayWait = racing && crash.waitedSteps < WAITING_AT_MOST;
  if (crash.waitingForACar) {
    const coming = mayWait ? carsComing(rider.motion, cars) : [];
    crash.waitingForACar = coming.length > 0;
    if (crash.waitingForACar) {
      crash.steps++;
      crash.waitedSteps++;
      standClear(crash.body, coming, edge);
      return;
    }
  }
  const onFoot = !racing ? STAND_STILL : isPlayer(rider) ? input : RUN_STRAIGHT_BACK;
  carryOn(crash, rider.motion, onFoot, edge);
  if (!racing || !canRemount(crash, rider.motion)) return;
  crash.waitingForACar = mayWait && carsComing(rider.motion, cars).length > 0 && !copClose(race, rider);
  if (!crash.waitingForACar) getBackOn(race, rider);
}

/** A rider on foot who has reached their bike rides off on it again, with at least some stamina. */
function getBackOn(race: RaceState, rider: Rider) {
  rider.crash = null;
  remount(rider.motion);
  rider.stamina = Math.max(rider.stamina, TUNING.remountStamina);
  race.events.push({ type: "remounted", rider: rider.id });
}
