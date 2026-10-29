import { type Group, Quaternion, Vector3 } from "three";
import type { AttackSnapshot, Weapon } from "@/race";
import type { Limb, RiderModel } from "./rider-model";

/**
 * Procedural animation for the rider model's joints: punches, kicks and club
 * swings from the saddle, a held club, tumbling after a crash, and running
 * back to the bike. Every
 * direction is given in the rider's own frame (x to their right, y up, -z
 * ahead), and each joint is turned so its bone points that way.
 */

/** A punch or swing holds at full stretch for this share of its recovery before the arm comes back. */
const HOLD = 0.3;
/** Metres per second at which a running rider swings their limbs fully. */
const FULL_RUN = 6;
/** Hips above the ground when standing or running (metres). */
const STANDING_HIPS = 0.95;
/** Hips above the ground when tumbling: the rider rolls about their middle (metres). */
const TUMBLING_HIPS = 0.55;

const UP = new Vector3(0, 1, 0);
const aimed = new Quaternion();
const parentTurn = new Quaternion();
const straight = new Quaternion();
const direction = new Vector3();

/** Turns a joint whose parent is turned by `parent` (in the rider's frame) so its bone points along (x, y, z), `weight` of the way from its rest. */
function aim(model: RiderModel, joint: Group, parent: Quaternion | null, x: number, y: number, z: number, weight: number) {
  const rest = model.rest.get(joint);
  if (!rest) return;
  aimed.setFromUnitVectors(UP, direction.set(x, y, z).normalize());
  if (parent) aimed.premultiply(parentTurn.copy(parent).invert());
  joint.quaternion.copy(rest).slerp(aimed, weight);
}

/** Straightens a limb's lower joint (elbow or knee) `weight` of the way from its rest bend. */
function unbend(model: RiderModel, limb: Limb, weight: number) {
  const rest = model.rest.get(limb.lower);
  if (rest) limb.lower.quaternion.copy(rest).slerp(straight, weight);
}

/** Puts every joint back in the riding crouch. */
export function restJoints(model: RiderModel) {
  for (const [joint, rest] of model.rest) joint.quaternion.copy(rest);
}

/**
 * Poses the arm or leg that throws an attack: cocked back through the
 * wind-up, snapped out to the side of the target at the strike, held there a
 * moment and brought back through the recovery. A club swing raises the club
 * up and back instead, and sweeps it out.
 */
export function poseAttack(model: RiderModel, attack: AttackSnapshot) {
  const side = attack.side;
  const kick = attack.kind === "kick";
  const limb = (kick ? model.legs : model.arms)[side < 0 ? 0 : 1];
  const parent = kick ? null : model.torso.quaternion;
  const weight = attackWeight(attack);
  if (attack.kind === "club-swing") {
    const { x, y, z } = swingDirection(ARM_RAISED, ARM_STRUCK, side, attack);
    aim(model, limb.upper, parent, x, y, z, weight);
    if (attack.stage === "recovery") unbend(model, limb, weight);
    return;
  }
  if (attack.stage === "wind-up") {
    if (kick) aim(model, limb.upper, parent, side * 0.55, -0.15, -0.65, weight);
    else aim(model, limb.upper, parent, side * 0.5, -0.25, 0.75, weight);
    return;
  }
  if (kick) aim(model, limb.upper, parent, side, -0.5, -0.05, weight);
  else aim(model, limb.upper, parent, side, 0.12, -0.3, weight);
  unbend(model, limb, weight);
}

/**
 * How far an attack's pose is from rest (0) to cocked, raised or struck (1):
 * rising through the wind-up, held a moment after the strike, then easing back.
 */
function attackWeight(attack: AttackSnapshot): number {
  if (attack.stage === "wind-up") return ease(attack.progress);
  return attack.progress < HOLD ? 1 : 1 - ease((attack.progress - HOLD) / (1 - HOLD));
}

/** A club swing sweeps from raised to struck over this share of its recovery. */
const SWEEP = 0.18;

/** A direction in the rider's frame for a swing to their right; a swing to the left mirrors x. */
type Direction = readonly [number, number, number];

/** The upper arm raised at the end of a swing's wind-up, and swung out at its strike. */
const ARM_RAISED: Direction = [0.45, 0.8, 0.45];
const ARM_STRUCK: Direction = [1, 0.3, -0.35];
/** A held club rests upright beside the rider's head, cocks back over their shoulder through a swing's wind-up, and points out at the target at the strike. */
const CLUB_RESTING: Direction = [0.3, 0.9, 0.35];
const CLUB_RAISED: Direction = [0.35, 0.75, 0.6];
const CLUB_STRUCK: Direction = [1, -0.25, -0.5];

const swung = new Vector3();
const struckWay = new Vector3();

/** The way a swing points on `side` at this moment: `raised` through the wind-up, then swept round to `struck` just after the strike. */
function swingDirection(raised: Direction, struck: Direction, side: -1 | 1, attack: AttackSnapshot): Vector3 {
  mirrored(swung, raised, side);
  if (attack.stage === "recovery") swung.lerp(mirrored(struckWay, struck, side), ease(attack.progress / SWEEP)).normalize();
  return swung;
}

/** Sets `target` to the unit vector along `direction`, mirrored to the left when `side` is -1. */
function mirrored(target: Vector3, direction: Direction, side: -1 | 1): Vector3 {
  return target.set(side * direction[0], direction[1], direction[2]).normalize();
}

const clubWay = new Vector3();
/** The turn from the rider's frame into the frame of the forearm that grips the club. */
const intoForearm = new Quaternion();

/** What a rider holds, as the race last said, and the hand a club is in. */
interface Armed {
  readonly weapon: Weapon | null;
  /** 1 the right hand, -1 the left. */
  readonly clubHand: -1 | 1;
  readonly attack: AttackSnapshot | null;
}

/**
 * Shows the club in the rider's club hand while the race says they hold one,
 * hiding it otherwise, and points it: upright beside the rider's head while they ride,
 * cocked back over the shoulder through a swing's wind-up and swept out at
 * the target at the strike. Call it after `poseAttack`, since the club turns
 * with the arm that holds it.
 */
export function poseClub(model: RiderModel, { weapon, clubHand: hand, attack }: Armed) {
  const holding = weapon === "club";
  const [left, right] = model.clubs;
  left.visible = holding && hand < 0;
  right.visible = holding && hand > 0;
  if (!holding) return;
  mirrored(clubWay, CLUB_RESTING, hand);
  if (attack?.kind === "club-swing" && attack.side === hand) {
    clubWay.lerp(swingDirection(CLUB_RAISED, CLUB_STRUCK, hand, attack), attackWeight(attack)).normalize();
  }
  // The club turns with the forearm that grips it, which turns with the upper arm and the torso.
  const arm = model.arms[hand < 0 ? 0 : 1];
  intoForearm.copy(model.torso.quaternion).multiply(arm.upper.quaternion).multiply(arm.lower.quaternion).invert();
  aimed.setFromUnitVectors(UP, clubWay);
  (hand < 0 ? left : right).quaternion.copy(intoForearm).multiply(aimed);
}

/** Spreads a tumbling rider's limbs, like a rag doll, `amount` (0 to 1) of the way. */
export function poseTumble(model: RiderModel, amount: number) {
  model.arms.forEach((arm, index) => {
    const side = index === 0 ? -1 : 1;
    aim(model, arm.upper, model.torso.quaternion, side * 0.9, 0.55, -0.2, amount);
    unbend(model, arm, amount * 0.7);
  });
  model.legs.forEach((leg, index) => {
    const side = index === 0 ? -1 : 1;
    aim(model, leg.upper, null, side * 0.45, -0.85, 0.35, amount);
    unbend(model, leg, amount * 0.6);
  });
}

/**
 * Stands the rider up and runs: torso upright and leaning into the run, head
 * level, legs and arms swinging in opposition through `stride` (radians),
 * as far as `speed` (m/s) calls for; standing still, limbs hang straight.
 */
export function poseRun(model: RiderModel, stride: number, speed: number) {
  const swing = Math.min(1, Math.abs(speed) / FULL_RUN);
  const step = Math.sin(stride);
  aim(model, model.torso, null, 0, 1, -0.25 * swing, 1);
  model.head.quaternion.copy(model.torso.quaternion).invert();
  model.legs.forEach((leg, index) => {
    const side = index === 0 ? -1 : 1;
    const forward = step * side * 0.7 * swing;
    aim(model, leg.upper, null, side * 0.08, -1, -forward, 1);
    unbend(model, leg, 1 - 0.6 * swing * Math.max(0, -forward));
  });
  model.arms.forEach((arm, index) => {
    const side = index === 0 ? -1 : 1;
    const forward = -step * side * 0.6 * swing;
    aim(model, arm.upper, model.torso.quaternion, side * 0.22, -1, -forward, 1);
    unbend(model, arm, 1 - 0.7 * swing);
  });
}

/** Hips above the ground for a rider off their bike: rolling about their middle while tumbling, standing once on foot. */
export function hipsHeight(tumbling: boolean, tumble: number): number {
  return tumbling ? TUMBLING_HIPS + 0.3 * Math.abs(Math.sin(tumble / 2)) : STANDING_HIPS;
}

/** Slow at both ends: 0 to 1 as `t` goes from 0 to 1. */
function ease(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
