import { type Group, Quaternion, Vector3 } from "three";
import type { AttackSnapshot } from "@/race";
import type { Limb, RiderModel } from "./rider-model";

/**
 * Procedural animation for the rider model's joints: punches and kicks from
 * the saddle, tumbling after a crash, and running back to the bike. Every
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
 * moment and brought back through the recovery.
 */
export function poseAttack(model: RiderModel, attack: AttackSnapshot) {
  const side = attack.side;
  const kick = attack.kind === "kick";
  const limb = (kick ? model.legs : model.arms)[side < 0 ? 0 : 1];
  const parent = kick ? null : model.torso.quaternion;
  if (attack.stage === "wind-up") {
    const cock = ease(attack.progress);
    if (kick) aim(model, limb.upper, parent, side * 0.55, -0.15, -0.65, cock);
    else aim(model, limb.upper, parent, side * 0.5, -0.25, 0.75, cock);
    return;
  }
  const out = attack.progress < HOLD ? 1 : 1 - ease((attack.progress - HOLD) / (1 - HOLD));
  if (kick) aim(model, limb.upper, parent, side, -0.5, -0.05, out);
  else aim(model, limb.upper, parent, side, attack.kind === "club-swing" ? 0.35 : 0.12, -0.3, out);
  unbend(model, limb, out);
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
