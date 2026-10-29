import type { AttackKind } from "./events";
import type { Motion } from "./riding";
import { stepsIn } from "./steps";
import { TUNING } from "./tuning";

/** A weapon a rider can hold and swing instead of punching: in this game, only the club. */
export type Weapon = "club";

/** An attack under way: it winds up, strikes, then recovers before the next. */
export interface Attack {
  readonly kind: AttackKind;
  /** Steps since the attack was thrown. */
  steps: number;
  /** Which way the attack goes: 1 to the attacker's right, -1 to their left. */
  side: -1 | 1;
}

/** Where an attack is: winding up to its strike, or recovering after it, and how far through that (0 to 1). */
export function attackStage({ kind, steps }: Attack): { stage: "wind-up" | "recovery"; progress: number } {
  const windUp = windUpSteps(kind);
  return steps < windUp
    ? { stage: "wind-up", progress: steps / windUp }
    : { stage: "recovery", progress: (steps - windUp) / (attackSteps(kind) - windUp) };
}

/** Steps from throwing an attack to its strike. */
export function windUpSteps(kind: AttackKind): number {
  return stepsIn(TUNING.attacks[kind].windUp);
}

/** Steps from throwing an attack until its attacker can throw the next. */
export function attackSteps(kind: AttackKind): number {
  return windUpSteps(kind) + stepsIn(TUNING.attacks[kind].recovery);
}

/** Whether `target` is within reach of an attack of this kind from `attacker`. */
export function withinReach(attacker: Readonly<Motion>, target: Readonly<Motion>, kind: AttackKind): boolean {
  return (
    Math.abs(target.offset - attacker.offset) <= TUNING.attacks[kind].reachAcross &&
    Math.abs(target.distance - attacker.distance) <= TUNING.attackReachAlong
  );
}

/** Which way `target` lies sideways from `attacker`: 1 for right, -1 for left (right when level). */
export function awayFrom(attacker: Readonly<Motion>, target: Readonly<Motion>): -1 | 1 {
  return target.offset >= attacker.offset ? 1 : -1;
}

/**
 * The candidate nearest `attacker` (straight-line, in track space) that an
 * attack of this kind can reach, or null. Ties go to the earlier candidate.
 */
export function nearestWithinReach<T extends { readonly motion: Readonly<Motion> }>(
  attacker: Readonly<Motion>,
  candidates: readonly T[],
  kind: AttackKind,
): T | null {
  let nearest: T | null = null;
  let nearestSquared = Infinity;
  for (const candidate of candidates) {
    if (candidate.motion === attacker || !withinReach(attacker, candidate.motion, kind)) continue;
    const along = candidate.motion.distance - attacker.distance;
    const across = candidate.motion.offset - attacker.offset;
    const squared = along * along + across * across;
    if (squared < nearestSquared) {
      nearest = candidate;
      nearestSquared = squared;
    }
  }
  return nearest;
}
