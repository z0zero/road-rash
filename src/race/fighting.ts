import type { Cop } from "./cops";
import { crash, throwOff, type Crash } from "./crashing";
import type { AttackKind, RiderOrCop } from "./events";
import { afterHittingThePlayer } from "./opponent-fighting";
import { copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import { isPlayer, type Rider } from "./riders";
import type { Motion } from "./riding";
import { STEP_SECONDS, stepsIn } from "./steps";
import type { Side } from "./track";
import { TUNING } from "./tuning";

/** Anyone who fights: a rider, or a cop. */
export type Fighter = Rider | Cop;

/** What the race keeps track of for anyone who fights, a rider or a cop. */
export interface FighterState {
  /** The bike's motion, which is the fighter's too while they ride it. */
  readonly motion: Motion;
  /** How much fight they have left. */
  stamina: number;
  /** Steps since they were last hit (Infinity if never). */
  stepsSinceHit: number;
  /** The attack they are making, or null. */
  attack: Attack | null;
  /** The weapon they hold, or null. */
  weapon: Weapon | null;
  /** Null while they are on their bike; how they are getting on after being thrown off it. */
  crash: Crash | null;
}

/** How events name a fighter. */
export function who(fighter: Fighter): RiderOrCop {
  return fighter.kind === "rider" ? { kind: "rider", id: fighter.id } : { kind: "cop", id: fighter.id };
}

/** A weapon a rider can hold and swing instead of punching: in this game, only the club. */
export type Weapon = "club";

/** An attack under way: it winds up, strikes, then recovers before the next. */
export interface Attack {
  readonly kind: AttackKind;
  /** Steps since the attack was thrown. */
  steps: number;
  /** Which way the attack goes: to the attacker's right or left. */
  side: Side;
  /**
   * The club holder it was thrown at while they were winding up a swing, or
   * null: if it lands on them, it takes their club, however late in the
   * wind-up it was thrown.
   */
  readonly thrownMidSwingAt: RiderOrCop | null;
}

/** Where an attack is: winding up to its strike, or recovering after it, and how far through that (0 to 1). */
export function attackStage({ kind, steps }: Attack): { stage: "wind-up" | "recovery"; progress: number } {
  const windUp = windUpSteps(kind);
  return steps < windUp
    ? { stage: "wind-up", progress: steps / windUp }
    : { stage: "recovery", progress: (steps - windUp) / (attackSteps(kind) - windUp) };
}

/** Steps from throwing an attack to its strike. */
function windUpSteps(kind: AttackKind): number {
  return stepsIn(TUNING.attacks[kind].windUp);
}

/** Whether an attack is a club swing still winding up to its strike: when a hit thrown at its holder can take their club. */
export function isMidSwing(attack: Attack | null): boolean {
  return attack !== null && attack.kind === "club-swing" && attack.steps < windUpSteps(attack.kind);
}

/** Steps from throwing an attack until its attacker can throw the next. */
function attackSteps(kind: AttackKind): number {
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
function awayFrom(attacker: Readonly<Motion>, target: Readonly<Motion>): Side {
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

/** Stamina starts recovering once a rider has gone this many steps without being hit. */
const RECOVERY_DELAY_STEPS = stepsIn(TUNING.staminaRecoveryDelay);

/** Whether a fighter is in a fight: on their bike in the race. */
function canFight(fighter: Fighter) {
  return fighter.kind === "rider" ? fighter.status === "racing" && !fighter.crash : fighter.status === "riding";
}

/** Whom a fighter's attacks can land on: riders on their bikes, and cops in the race too for a rider. */
export function targetsFor(race: RaceState, attacker: Fighter): Fighter[] {
  return attacker.kind === "rider" ? [...onTheirBikes(race), ...copsInTheRace(race)] : onTheirBikes(race);
}

/** A fighter's punch: a club holder swings their club instead. */
export function punchOf(fighter: Fighter): AttackKind {
  return fighter.weapon === "club" ? "club-swing" : "punch";
}

/**
 * Starts an attack's wind-up, aimed at the nearest rider or cop within reach
 * (if any): towards them, or else to the right. A punch from a club holder
 * is a club swing.
 */
export function throwAttack(race: RaceState, attacker: Fighter, thrown: AttackKind) {
  const kind = thrown === "punch" ? punchOf(attacker) : thrown;
  const target = nearestWithinReach(attacker.motion, targetsFor(race, attacker), kind);
  attacker.attack = {
    kind,
    steps: 0,
    side: target ? awayFrom(attacker.motion, target.motion) : 1,
    thrownMidSwingAt: target && isMidSwing(target.attack) ? who(target) : null,
  };
  race.events.push({ type: "attack-thrown", attacker: who(attacker), target: target && who(target), kind });
}

/** Moves every attack on by a step: each strikes at the end of its wind-up and is over after its recovery. */
export function advanceAttacks(race: RaceState) {
  for (const attacker of [...race.riders, ...race.cops]) {
    const attack = attacker.attack;
    if (!attack) continue;
    attack.steps++;
    if (attack.steps === windUpSteps(attack.kind) && canFight(attacker)) {
      const target = nearestWithinReach(attacker.motion, targetsFor(race, attacker), attack.kind);
      if (target) {
        attack.side = awayFrom(attacker.motion, target.motion);
        land(race, attacker, target, attack);
      }
    }
    if (attack.steps >= attackSteps(attack.kind)) attacker.attack = null;
  }
}

function land(race: RaceState, attacker: Fighter, target: Fighter, { kind, thrownMidSwingAt }: Attack) {
  race.events.push({ type: "attack-landed", attacker: who(attacker), target: who(target), kind });
  // An opponent whose hit lands on a player who doesn't fight it back gives them a breather before its next attack,
  // and after a few such hits gives up on them.
  if (attacker.kind === "rider" && target.kind === "rider") {
    if (isPlayer(attacker)) {
      target.stepsSinceThePlayerHitIt = 0;
      target.patience.unansweredHits = 0;
    } else if (isPlayer(target)) afterHittingThePlayer(attacker, race.difficultyTuning);
  }
  takeTheClub(race, attacker, target, thrownMidSwingAt);
  const { stamina, shove } = TUNING.attacks[kind];
  // A kick shoves its target sideways, away from the attacker.
  if (shove > 0) target.motion.kickShove = awayFrom(attacker.motion, target.motion) * shove;
  // A hit on a rider or cop with no stamina left knocks them off their bike.
  if (target.stamina <= 0) {
    if (target.kind === "rider") crash(race, target, "knocked-off", target.motion.speed);
    else knockOff(race, target);
  }
  target.stamina = Math.max(0, target.stamina - stamina);
  target.stepsSinceHit = 0;
  if (target.kind === "cop" && attacker.kind === "rider" && target.status === "riding") fightBack(race, target, attacker);
}

/**
 * Any hit a rider throws at another rider winding up a club swing (`thrownMidSwingAt` them) takes the club, and the
 * swing, if it hasn't struck, never does. Cops neither take clubs nor lose them.
 */
function takeTheClub(race: RaceState, attacker: Fighter, target: Fighter, thrownMidSwingAt: RiderOrCop | null) {
  const intoTheSwing = thrownMidSwingAt?.kind === target.kind && thrownMidSwingAt.id === target.id;
  if (attacker.kind === "rider" && target.kind === "rider" && intoTheSwing && target.weapon === "club") {
    target.weapon = null;
    target.attack = null;
    attacker.weapon = "club";
    race.events.push({ type: "weapon-stolen", from: who(target), by: who(attacker) });
  }
}

/** Knocks a cop off their bike and out of the race for good, dropping their club. */
function knockOff(race: RaceState, cop: Cop) {
  race.events.push({ type: "cop-knocked-off", cop: cop.id, impactSpeed: cop.motion.speed });
  cop.status = "knocked-off";
  cop.crash = throwOff(cop.motion);
  cop.attack = null;
  cop.weapon = null;
  cop.busting = null;
  cop.fightingBack = null;
}

/** A cop hit by a rider fights back against them, until a while after it was last hit. */
function fightBack(race: RaceState, cop: Cop, rider: Rider) {
  if (cop.fightingBack !== rider.id) race.events.push({ type: "cop-retaliating", cop: cop.id, target: rider.id });
  cop.fightingBack = rider.id;
  cop.fightingBackSteps = stepsIn(TUNING.cops.fightingBackSeconds);
}

/** Riders and cops who have gone long enough without being hit get their stamina back, a little every step. */
export function recoverStamina(race: RaceState) {
  for (const fighter of [...race.riders, ...race.cops]) {
    fighter.stepsSinceHit++;
    if (fighter.stepsSinceHit > RECOVERY_DELAY_STEPS) {
      const full = fighter.kind === "rider" ? TUNING.fullStamina : TUNING.cops.fullStamina;
      fighter.stamina = Math.min(full, fighter.stamina + TUNING.staminaRecovery * STEP_SECONDS);
    }
  }
}
