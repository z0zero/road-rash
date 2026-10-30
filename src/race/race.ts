import { getCoastalTrack } from "./coastal-track";
import { carRunningInto, knockDownBy, settleContact, settleImpacts, throwClearOf } from "./contact";
import {
  bustingIntent,
  COP_ATTACK_EVERY_SECONDS,
  fightingBackIntent,
  lineUpCops,
  moveCop,
  takeTurns,
  patrolIntent,
  pullingOverIntent,
  type Cop,
  type CopIntent,
  type CopStatus,
} from "./cops";
import { canRemount, carryOn, remount, slide, throwOff, type CrashPhase, type OnFootControls } from "./crashing";
import type { AttackKind, CopId, CrashCause, RaceEvent, RaceOutcome, RiderId, RiderOrCop } from "./events";
import { lineUpOpponents } from "./field";
import {
  attackStage,
  attackSteps,
  awayFrom,
  isMidSwing,
  nearestWithinReach,
  windUpSteps,
  withinReach,
  type Attack,
  type Weapon,
} from "./fighting";
import { footprintOfACopsBike, footprintOfCar, footprintOfObstacle, type Footprint } from "./footprint";
import { QUALIFYING_POSITION } from "./limits";
import {
  breatherAfterHitting,
  isDroppingBack,
  isFightingBack,
  opponentAttack,
  opponentIntent,
  waitingIntent,
  wearPatience,
  whoseTurn,
  wholePatience,
} from "./opponent-fighting";
import { catchUpFor, opponentControls, paceAt, paceFor, type Intent } from "./opponent-riding";
import { OPPONENTS, PLAYER_NAME, type Temperament } from "./opponents";
import { copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import { createRandom } from "./random";
import { remarkOn, type Ending, type Remark } from "./remarks";
import { PLAYER, whereIs, type Rider, type RiderStatus } from "./riders";
import { isOffRoad, ride, type Controls, type Motion } from "./riding";
import { STEP_SECONDS, STEPS_PER_SECOND, stepsIn } from "./steps";
import { nearestOpponentOrCop, warningsFor, type Warnings } from "./surroundings";
import type { Track } from "./track";
import { CLOSED_ROAD, createTraffic, type CarKind, type Traffic } from "./traffic";
import { TUNING } from "./tuning";

/** The 3-2-1 countdown lasts three seconds. */
const COUNTDOWN_STEPS = 3 * STEPS_PER_SECOND;

/** Once over the finish line, a rider lets go of the throttle and brakes to a stop. */
const FINISHED_CONTROLS: Controls = { throttle: 0, brake: 0.7, steer: 0 };

/** Opponents on foot run straight back to their bikes. */
const RUN_STRAIGHT_BACK: OnFootControls = { steer: 0, brake: 0 };

/** A rider whose race is over stays where they are once they are on their feet. */
const STAND_STILL: OnFootControls = { steer: 0, brake: 1 };

/**
 * Fast-forwarding races the rest of the field until the race clock reads six
 * minutes at most: a race takes about three, so everyone who can still finish
 * does, even after the player's race ended in its first seconds.
 */
const FAST_FORWARD_UNTIL_STEPS = COUNTDOWN_STEPS + 6 * 60 * STEPS_PER_SECOND;

/** At the start, cars in the race direction keep at least this many metres ahead of the riders lined up for it. */
const CLEAR_OF_THE_GRID = 60;
/** Mixed into the race's seed for the traffic's own random choices, so they never change the riders' choices. */
const TRAFFIC_SEED = 0x7ea5_1c3a;
/** Mixed into the race's seed for choosing the remark on the results, so the choice never changes the race. */
const REMARK_SEED = 0x2e3a_4b51;

/** The player's controls for one step. Values outside their ranges are clamped. */
export interface PlayerInput {
  /** 0 (closed) to 1 (full throttle). */
  readonly throttle: number;
  /** 0 (off) to 1 (full brake). */
  readonly brake: number;
  /** -1 (full left) to 1 (full right). */
  readonly steer: number;
  /** The punch button was pressed for this step. */
  readonly punch: boolean;
  /** The kick button was pressed for this step. */
  readonly kick: boolean;
}

export const NO_INPUT: PlayerInput = { throttle: 0, brake: 0, steer: 0, punch: false, kick: false };

export interface RiderSnapshot {
  readonly id: RiderId;
  /** The opponent's nickname, or "You" for the player. */
  readonly name: string;
  /** How the opponent races and fights; null for the player. */
  readonly temperament: Temperament | null;
  /** Metres along the track's centreline. */
  readonly distance: number;
  /** Metres sideways from the centreline; positive is right of the race direction. */
  readonly offset: number;
  /** Metres per second along the track. */
  readonly speed: number;
  /** Whether the rider is beyond the road's edge, on a shoulder, where a bike slows sharply. */
  readonly offRoad: boolean;
  readonly status: RiderStatus;
  /** Position in the race, 1 for the leader; null for wrecked and busted riders. */
  readonly position: number | null;
  /** Race time at which the rider crossed the finish line, in seconds; null until then. */
  readonly finishTime: number | null;
  /** How much fight the rider has left: 100 when fresh, down to 0. */
  readonly stamina: number;
  /** How intact the rider's bike is: 100 when perfect, down to 0, when it is wrecked. */
  readonly condition: number;
  /** The attack the rider is making, or null. */
  readonly attack: AttackSnapshot | null;
  /** The weapon the rider holds, which their punches swing instead; null when they hold none. */
  readonly weapon: Weapon | null;
  /**
   * Null while the rider is on their bike; after a crash, "tumbling" and then
   * "on-foot" until they remount, and "knocked-down" while they tumble again
   * after a car has knocked them down on foot.
   */
  readonly crash: CrashPhase | null;
  /** Where the rider's bike is: under them while they ride it, or wherever it slid to after a crash. */
  readonly bike: BikeSnapshot;
}

/** An attack under way: it winds up, strikes at the end of its wind-up, then recovers before the next. */
export interface AttackSnapshot {
  readonly kind: AttackKind;
  /** Which way the attack goes: 1 to the attacker's right, -1 to their left. */
  readonly side: -1 | 1;
  readonly stage: "wind-up" | "recovery";
  /** How far through its stage the attack is, from 0 to 1. */
  readonly progress: number;
}

export interface BikeSnapshot {
  /** Metres along the track's centreline. */
  readonly distance: number;
  /** Metres sideways from the centreline; positive is right of the race direction. */
  readonly offset: number;
  /** Metres per second along the track. */
  readonly speed: number;
}

/** Everything visible in the race at one moment. Snapshots are plain data that later steps never change. */
export interface RaceSnapshot {
  /** Seconds left in the 3-2-1 countdown; 0 once the race has started. */
  readonly countdown: number;
  /** Race time in seconds since the start; 0 during the countdown. */
  readonly clock: number;
  /** Every rider, indexed by `RiderId`. */
  readonly riders: readonly RiderSnapshot[];
  /**
   * The opponent on their bike, or the cop in the race, nearest the player,
   * whose name and stamina the HUD shows; null when none is within 50 m.
   */
  readonly nearestOpponentOrCop: RiderOrCop | null;
  /** Opponents alongside the player, or coming up from behind, on either side of them. */
  readonly warnings: Warnings;
  /** The cars on the road around the player. */
  readonly traffic: readonly CarSnapshot[];
  /** Every cop, indexed by `CopId`. */
  readonly cops: readonly CopSnapshot[];
}

/** A car on the road: someone driving by who isn't racing. */
export interface CarSnapshot {
  /** No two cars in a race share an id, so a car can be followed from one snapshot to the next. */
  readonly id: number;
  /** The body the car is built on. */
  readonly kind: CarKind;
  /** Whether the car drives towards the riders, in the left lanes; otherwise it drives in the race direction, in the right lanes. */
  readonly oncoming: boolean;
  /** Metres along the track's centreline: the middle of the car. */
  readonly distance: number;
  /** Metres sideways from the centreline; positive is right of the race direction. */
  readonly offset: number;
  /** Metres per second in the car's own direction of travel. */
  readonly speed: number;
  /** Metres from bumper to bumper. */
  readonly length: number;
  /** Metres from side to side. */
  readonly width: number;
}

/** A cop on a motorcycle, as the riders see them. */
export interface CopSnapshot {
  readonly id: CopId;
  readonly name: string;
  readonly status: CopStatus;
  /** Where the cop is, on their bike or off it: metres along the track's centreline. */
  readonly distance: number;
  /** Metres sideways from the centreline; positive is right of the race direction. */
  readonly offset: number;
  /** Metres per second along the track. */
  readonly speed: number;
  /** How much fight the cop has left: 150 when fresh, down to 0. */
  readonly stamina: number;
  /** The attack the cop is making, or null. */
  readonly attack: AttackSnapshot | null;
  /** The weapon the cop holds, which their punches swing instead: a club, unless a rider has taken it. */
  readonly weapon: Weapon | null;
  /** Null while the cop is on their bike; "tumbling" and then "on-foot" once knocked off it. */
  readonly crash: CrashPhase | null;
  /** Where the cop's bike is: under them while they ride it, or wherever it slid to after they were knocked off. */
  readonly bike: BikeSnapshot;
  /** The crashed rider the cop is riding to, to bust them; null when it isn't busting anyone. */
  readonly busting: RiderId | null;
  /** The rider the cop is fighting back against, for hitting it; null when it isn't fighting anyone. */
  readonly fightingBack: RiderId | null;
  /** Whether the cop is in the race within 150 m of the player: the cop alert is on, and the siren sounds, while one is. */
  readonly near: boolean;
}

/** How the race went for everyone, once the player's race is over. */
export interface RaceResults {
  /** How the player's race ended. */
  readonly outcome: RaceOutcome;
  /** The player's finishing time in seconds; null unless they finished. */
  readonly time: number | null;
  /** The player's final position; null if they were wrecked or busted. */
  readonly position: number | null;
  /** Whether the player finished in third position or better. */
  readonly qualified: boolean;
  /**
   * Whether the standings are final: false while the rest of the field is
   * still being raced to the finish. The player's own result above is final
   * either way.
   */
  readonly complete: boolean;
  /**
   * Every rider: finishers in finishing order, then anyone still racing (on
   * their way to the finish, or, once the standings are complete, still on the
   * road when the fast-forward ran out of time), by distance, then wrecked and
   * busted riders.
   */
  readonly standings: readonly Standing[];
  /** A one-line remark on how the player's race went, chosen with the race's seed; null until the standings are complete. */
  readonly remark: Remark | null;
}

export interface Standing {
  readonly rider: RiderId;
  /** The opponent's nickname, or "You" for the player. */
  readonly name: string;
  readonly status: RiderStatus;
  readonly position: number | null;
  /** Finishing time in seconds; null unless the rider finished. */
  readonly time: number | null;
}

export interface RaceOptions {
  /** Seeds every random choice the race makes, so the same seed and inputs replay the same race. */
  readonly seed: number;
  /**
   * How intact the player's bike is at the start, up to 100 (perfect, the
   * default), for a bike that comes into the race already worn. Every
   * opponent's bike starts perfect.
   */
  readonly playerCondition?: number;
  /** Whether cars drive on the road (the default). Without them, the race runs on a closed road. */
  readonly traffic?: boolean;
  /** Whether cops wait along the track to join the race (the default). Without them, nobody is busted. */
  readonly cops?: boolean;
}

/**
 * One race, simulated deterministically in track space (ADR 0004).
 *
 * Step it by exactly `STEP_SECONDS` with the player's input for that step, read
 * snapshots of everything visible, and drain the events its steps emitted.
 */
export interface Race {
  /** The track this race is run on. It never changes. */
  readonly track: Track;
  /** Advances the race by exactly `STEP_SECONDS` with the player's input for that step. */
  step(input: PlayerInput): void;
  /** Everything visible right now, as a new object. */
  snapshot(): RaceSnapshot;
  /** Returns and clears every event emitted since the previous call, oldest first. */
  drainEvents(): RaceEvent[];
  /**
   * Once the player's race is over, races the rest of the field on towards the
   * finish, with the player's input released, by up to `steps` steps (all the
   * way, if not given), and returns the results as they stand: complete once
   * every rider has finished or is out of the race, or the race clock reads six
   * minutes. A step at a time, it can be spread over several frames. Events
   * emitted on the way are queued as usual. Throws while the player is still
   * racing.
   */
  fastForward(steps?: number): RaceResults;
}

/** Anyone who fights: a rider, or a cop. */
type Fighter = Rider | Cop;

/** How events name a fighter. */
function who(fighter: Fighter): RiderOrCop {
  return fighter.kind === "rider" ? { kind: "rider", id: fighter.id } : { kind: "cop", id: fighter.id };
}

/** Where something is in track space, and how fast it goes along the track, as plain data. */
function placeOf({ distance, offset, speed }: { readonly distance: number; readonly offset: number; readonly speed: number }) {
  return { distance, offset, speed };
}

/** Metres between two places in track space (straight-line). */
function apart(a: { readonly distance: number; readonly offset: number }, b: { readonly distance: number; readonly offset: number }) {
  return Math.hypot(a.distance - b.distance, a.offset - b.offset);
}

/** Stamina starts recovering once a rider has gone this many steps without being hit. */
const RECOVERY_DELAY_STEPS = stepsIn(TUNING.staminaRecoveryDelay);

/**
 * A rider on the grid: fresh, on a bike in perfect condition, standing at
 * `distance` and `offset`. Bullies start the race with a club.
 */
function lineUp(rider: Pick<Rider, "id" | "name" | "temperament" | "riding">, distance: number, offset: number): Rider {
  return {
    ...rider,
    kind: "rider",
    motion: { distance, offset, speed: 0, steering: 0, shove: 0, kickShove: 0 },
    status: "racing",
    finishTime: null,
    finishOrder: null,
    stamina: TUNING.fullStamina,
    condition: TUNING.fullCondition,
    stepsSinceHit: Infinity,
    attack: null,
    weapon: rider.temperament === "bully" ? "club" : null,
    crash: null,
    droppingBack: false,
    patience: wholePatience(),
    stepsSinceThePlayerHitIt: Infinity,
    breatherSteps: 0,
  };
}

/** The race clock: seconds since the start, 0 during the countdown. */
function clock(race: RaceState) {
  return Math.max(0, race.stepsTaken - COUNTDOWN_STEPS) / STEPS_PER_SECOND;
}

/** Where the riders still racing are on the road, on their bikes or off them. */
function ridersOnTheRoad(race: RaceState) {
  return race.riders.filter((rider) => rider.status === "racing").map((rider) => ({ ...whereIs(rider), onTheirBike: !rider.crash }));
}

/** Whether a fighter is in a fight: on their bike in the race. */
function canFight(fighter: Fighter) {
  return fighter.kind === "rider" ? fighter.status === "racing" && !fighter.crash : fighter.status === "riding";
}

/** Whom a fighter's attacks can land on: riders on their bikes, and cops in the race too for a rider. */
function targetsFor(race: RaceState, attacker: Fighter): Fighter[] {
  return attacker.kind === "rider" ? [...onTheirBikes(race), ...copsInTheRace(race)] : onTheirBikes(race);
}

/** A fighter's punch: a club holder swings their club instead. */
function punchOf(fighter: Fighter): AttackKind {
  return fighter.weapon === "club" ? "club-swing" : "punch";
}

/**
 * Starts an attack's wind-up, aimed at the nearest rider or cop within reach
 * (if any): towards them, or else to the right. A punch from a club holder
 * is a club swing.
 */
function throwAttack(race: RaceState, attacker: Fighter, thrown: AttackKind) {
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
function advanceAttacks(race: RaceState) {
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
  // An opponent whose hit lands on a player who doesn't fight it back gives them a breather before its next attack.
  if (attacker.kind === "rider" && target.kind === "rider") {
    if (attacker.id === PLAYER) target.stepsSinceThePlayerHitIt = 0;
    else if (target.id === PLAYER) attacker.breatherSteps = breatherAfterHitting(attacker.stepsSinceThePlayerHitIt);
  }
  // Any hit a rider throws at another rider winding up a club swing takes the club, and the swing, if it hasn't
  // struck, never does. Cops neither take clubs nor lose them.
  const intoTheSwing = thrownMidSwingAt?.kind === target.kind && thrownMidSwingAt.id === target.id;
  if (attacker.kind === "rider" && target.kind === "rider" && intoTheSwing && target.weapon === "club") {
    target.weapon = null;
    target.attack = null;
    attacker.weapon = "club";
    race.events.push({ type: "weapon-stolen", from: who(target), by: who(attacker) });
  }
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
function decideCops(
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
  takeTurns(cops, race.rota, player, (cop) => cop.busting !== null || cop.fightingBack !== null || cop.standingBySteps > 0);
  return cops.map((cop) => {
    if (cop.status !== "riding") return null;
    if (cop.busting !== null) {
      return bustingIntent(cop.motion, whereIs(riders[cop.busting]), everyoneOnABike, carsAndObstacles, edge);
    }
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    if (fighting && !fighting.crash) {
      return fightingBackIntent(cop.motion, fighting.motion, track, everyoneOnABike, carsAndObstacles);
    }
    // Standing by a rider it has busted, or on patrol while the player is down, a cop pulls over onto the shoulder.
    if (cop.standingBySteps > 0 || riders[PLAYER].crash) return pullingOverIntent(cop.motion, track);
    return patrolIntent(cop.motion, player, cop.following, track, everyoneOnABike, carsAndObstacles);
  });
}

/**
 * Throws a rider off their bike, which loses condition; a bike whose
 * condition runs out is wrecked, and so is the rider's race. A rider who
 * crashes drops their club, which is lost.
 */
function crash(race: RaceState, rider: Rider, cause: CrashCause, impactSpeed: number) {
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
 * Every cop in the race within busting range of a rider who has just
 * crashed rides to them, unless it is busting someone already.
 */
function sendCopsTo(race: RaceState, rider: Rider) {
  for (const cop of copsInTheRace(race)) {
    if (cop.busting === null && apart(cop.motion, whereIs(rider)) <= TUNING.cops.bustingRange) cop.busting = rider.id;
  }
}

/** Cops stop riding to crashed riders who are back on their bikes, or whose race is over: they got away. */
function letGo(race: RaceState) {
  for (const cop of race.cops) {
    const rider = cop.busting === null ? null : race.riders[cop.busting];
    if (rider && (rider.status !== "racing" || !rider.crash)) cop.busting = null;
  }
}

/**
 * A cop that has reached the crashed rider it was riding to busts them,
 * ending their race, once they are on their feet: never while they tumble.
 */
function bustTheCaught(race: RaceState) {
  for (const cop of race.cops) {
    const rider = cop.busting === null ? null : race.riders[cop.busting];
    if (rider?.crash?.phase !== "on-foot" || rider.status !== "racing") continue;
    if (apart(cop.motion, whereIs(rider)) > TUNING.cops.bustingReach) continue;
    rider.status = "busted";
    cop.busting = null;
    cop.standingBySteps = stepsIn(TUNING.cops.standingBySeconds);
    race.events.push({ type: "busted", rider: rider.id, cop: cop.id });
    if (rider.id === PLAYER) {
      race.playerBustedBy = cop;
      race.events.push({ type: "player-race-over", outcome: "busted" });
    }
  }
}

/**
 * Riders on their bikes who run into the `cars` (by their footprints) or
 * obstacles crash, or bump off them at a small speed difference; a car
 * that runs into a rider on foot knocks them down. Cops in the race only
 * ever bump off cars and obstacles.
 */
function runIntoCarsAndObstacles(race: RaceState, cars: readonly Footprint[]) {
  const { edge } = race;
  for (const [footprints, cause] of [
    [cars, "traffic"],
    [race.obstacles, "obstacle"],
  ] as const) {
    for (const { rider, footprint, speedDifference } of settleImpacts(onTheirBikes(race), footprints, edge)) {
      crash(race, rider, cause, speedDifference);
      if (rider.crash) throwClearOf(footprint, rider.motion, rider.crash.body, edge);
    }
    settleImpacts(copsInTheRace(race), footprints, edge, () => false);
  }
  for (const rider of race.riders) {
    if (rider.status !== "racing" || rider.crash?.phase !== "on-foot") continue;
    const car = carRunningInto(rider.crash.body, cars);
    if (car) race.events.push({ type: "knocked-down", rider: rider.id, impactSpeed: knockDownBy(car, rider.crash) });
  }
}

/** A rider on foot who has reached their bike rides off on it again, with at least some stamina. */
function getBackOn(race: RaceState, rider: Rider) {
  rider.crash = null;
  remount(rider.motion);
  rider.stamina = Math.max(rider.stamina, TUNING.remountStamina);
  race.events.push({ type: "remounted", rider: rider.id });
}

/** Riders and cops who have gone long enough without being hit get their stamina back, a little every step. */
function recoverStamina(race: RaceState) {
  for (const fighter of [...race.riders, ...race.cops]) {
    fighter.stepsSinceHit++;
    if (fighter.stepsSinceHit > RECOVERY_DELAY_STEPS) {
      const full = fighter.kind === "rider" ? TUNING.fullStamina : TUNING.cops.fullStamina;
      fighter.stamina = Math.min(full, fighter.stamina + TUNING.staminaRecovery * STEP_SECONDS);
    }
  }
}

/** Cops waiting on the shoulder join the race once the player, still racing, has passed them. */
function joinThePlayer(race: RaceState) {
  const player = race.riders[PLAYER];
  if (player.status !== "racing") return;
  for (const cop of race.cops) {
    if (cop.status === "waiting" && whereIs(player).distance >= cop.motion.distance) cop.status = "riding";
  }
}

/** Says which cops have come near the player, and which have gone: cops in the race within their alert range of the player. */
function alertThePlayer(race: RaceState) {
  for (const cop of race.cops) {
    const near = cop.status === "riding" && apart(cop.motion, whereIs(race.riders[PLAYER])) <= TUNING.cops.alertRange;
    if (near === cop.near) continue;
    cop.near = near;
    race.events.push({ type: near ? "cop-near" : "cop-gone", cop: cop.id });
  }
}

/** Finishes the riders who crossed the finish line during the step that began at `clockBefore`, in the order they crossed it. */
function finishCrossings(race: RaceState, distancesBefore: readonly number[], clockBefore: number) {
  const { track } = race;
  const crossings = race.riders
    .filter((rider) => rider.status === "racing" && whereIs(rider).distance >= track.finishDistance)
    .map((rider) => {
      const before = distancesBefore[rider.id];
      const share = (track.finishDistance - before) / (whereIs(rider).distance - before);
      return { rider, time: clockBefore + share * STEP_SECONDS };
    })
    .sort((a, b) => a.time - b.time || a.rider.id - b.rider.id);
  for (const { rider, time } of crossings) {
    rider.finishTime = time;
    rider.status = "finished";
    rider.finishOrder = ++race.finishers;
    race.events.push({ type: "rider-finished", rider: rider.id, time, position: rider.finishOrder });
    if (rider.id === PLAYER) race.events.push({ type: "player-race-over", outcome: "finished" });
  }
}

/**
 * The riders who have a position, best first: finishers in finishing order,
 * then riders still racing by distance travelled. Wrecked and busted riders
 * have no position.
 */
function ranking(race: RaceState) {
  const finished = race.riders
    .filter((rider) => rider.status === "finished")
    .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0));
  const racing = race.riders
    .filter((rider) => rider.status === "racing")
    .sort((a, b) => whereIs(b).distance - whereIs(a).distance);
  return [...finished, ...racing];
}

function positions(race: RaceState) {
  return new Map(ranking(race).map((rider, index) => [rider.id, index + 1]));
}

function results(race: RaceState, outcome: RaceOutcome, complete: boolean): RaceResults {
  const { riders } = race;
  const standing = (rider: Rider, position: number | null): Standing => ({
    rider: rider.id,
    name: rider.name,
    status: rider.status,
    position,
    time: rider.finishTime,
  });
  const unplaced = riders.filter((rider) => rider.status === "wrecked" || rider.status === "busted");
  const standings = [
    ...ranking(race).map((rider, index) => standing(rider, index + 1)),
    ...unplaced.map((rider) => standing(rider, null)),
  ];
  const position = standings.find((entry) => entry.rider === PLAYER)?.position ?? null;
  const qualified = outcome === "finished" && position !== null && position <= QUALIFYING_POSITION;
  const opponents = standings.flatMap(({ rider, name, position }) => {
    const { temperament } = riders[rider];
    return temperament ? [{ id: rider, name, temperament, position }] : [];
  });
  const remark = complete
    ? remarkOn(endingFor(race, outcome, position, qualified), opponents, createRandom(race.seed ^ REMARK_SEED))
    : null;
  return { outcome, time: riders[PLAYER].finishTime, position, qualified, complete, standings, remark };
}

/** How the player's race ended, for the remark on it: a race that neither finished nor got them busted wrecked their bike. */
function endingFor(race: RaceState, outcome: RaceOutcome, position: number | null, qualified: boolean): Ending {
  const { playerBustedBy } = race;
  if (outcome === "busted" && playerBustedBy) return { outcome, cop: { id: playerBustedBy.id, name: playerBustedBy.name } };
  if (outcome === "finished" && position !== null) return { outcome, position, qualified };
  return { outcome: "wrecked" };
}

/** Everything visible in the race right now, as plain data. */
function snapshotOf(race: RaceState): RaceSnapshot {
  const { riders, cops, track, traffic } = race;
  const ranks = positions(race);
  const player = { id: PLAYER, ...whereIs(riders[PLAYER]) };
  const opponents = onTheirBikes(race)
    .filter((rider) => rider.id !== PLAYER)
    .map(({ id, motion: { distance, offset, speed } }) => ({ id, distance, offset, speed }));
  return {
    countdown: Math.max(0, COUNTDOWN_STEPS - race.stepsTaken) / STEPS_PER_SECOND,
    clock: clock(race),
    nearestOpponentOrCop: nearestOpponentOrCop(player, [
      ...opponents.map(({ id, distance, offset }) => ({ who: { kind: "rider", id } as const, distance, offset })),
      ...copsInTheRace(race).map((cop) => ({ who: who(cop), distance: cop.motion.distance, offset: cop.motion.offset })),
    ]),
    warnings: warningsFor(player, [...opponents, ...copsInTheRace(race).map(({ motion }) => motion)]),
    traffic: traffic.cars.map(({ id, kind, oncoming, distance, offset, speed, length, width }) => ({
      id,
      kind,
      oncoming,
      distance,
      offset,
      speed,
      length,
      width,
    })),
    riders: riders.map((rider) => {
      const { distance, offset, speed } = whereIs(rider);
      return {
        id: rider.id,
        name: rider.name,
        temperament: rider.temperament,
        distance,
        offset,
        speed,
        offRoad: isOffRoad(offset, track),
        status: rider.status,
        position: ranks.get(rider.id) ?? null,
        finishTime: rider.finishTime,
        stamina: rider.stamina,
        condition: rider.condition,
        attack: rider.attack && { kind: rider.attack.kind, side: rider.attack.side, ...attackStage(rider.attack) },
        weapon: rider.weapon,
        crash: rider.crash?.phase ?? null,
        bike: { distance: rider.motion.distance, offset: rider.motion.offset, speed: rider.motion.speed },
      };
    }),
    cops: cops.map((cop) => ({
      id: cop.id,
      name: cop.name,
      status: cop.status,
      ...placeOf(cop.crash ? cop.crash.body : cop.motion),
      stamina: cop.stamina,
      attack: cop.attack && { kind: cop.attack.kind, side: cop.attack.side, ...attackStage(cop.attack) },
      weapon: cop.weapon,
      crash: cop.crash?.phase ?? null,
      bike: placeOf(cop.motion),
      busting: cop.busting,
      fightingBack: cop.fightingBack,
      near: cop.near,
    })),
  };
}

/** Advances the race by exactly `STEP_SECONDS` with the player's input for that step. */
function step(race: RaceState, input: PlayerInput) {
  const { riders, cops, track, traffic, edge, random } = race;
  // The traffic drives on whatever the riders do, even while they wait for the countdown.
  if (race.stepsTaken < COUNTDOWN_STEPS) traffic.step(whereIs(riders[PLAYER]), ridersOnTheRoad(race));
  else {
    const clockBefore = clock(race);
    // Everyone decides what to do from where things stand, then everyone moves.
    const riding = onTheirBikes(race);
    const field = riding.map((rider) => rider.motion);
    // Everyone on a bike in the race, the cops too, whom riders and cops find their way around.
    const everyoneOnABike = [...field, ...copsInTheRace(race).map((cop) => cop.motion)];
    const player = riders[PLAYER];
    // Catch-up keeps the field near the player, so it stops once the player's race is over.
    const catchUp = (rider: Rider) =>
      player.status === "racing" ? catchUpFor(rider.motion.distance - whereIs(player).distance) : 1;
    const playerToFight = player.status === "racing" && !player.crash ? player.motion : null;
    for (const rider of riders) {
      rider.stepsSinceThePlayerHitIt++;
      rider.breatherSteps = Math.max(0, rider.breatherSteps - 1);
    }
    // What each opponent is up to: brawlers and bullies lose patience with a player who rides slowly beside them.
    const intents = new Map<Rider, Intent>();
    for (const rider of riding) {
      if (!rider.riding || !rider.temperament) continue;
      rider.droppingBack = isDroppingBack(rider.droppingBack, rider.stamina);
      const intent = opponentIntent(rider.temperament, rider.motion, playerToFight, rider.droppingBack, rider.patience.gaveUp);
      wearPatience(rider.patience, intent.alongside !== null, playerToFight?.speed ?? null, paceAt(rider.motion, rider.riding, track));
      intents.set(rider, intent);
    }
    // Brawlers and bullies take turns at the player: any that want to fight them while another has its turn wait theirs.
    const wanting = playerToFight ? riding.filter((rider) => intents.get(rider)?.alongside === playerToFight) : [];
    race.playersFighter = playerToFight ? whoseTurn(race.playersFighter, wanting, playerToFight) : null;
    const waiting = new Set(wanting.filter((rider) => rider !== race.playersFighter));
    for (const rider of waiting) if (playerToFight) intents.set(rider, waitingIntent(rider.motion, playerToFight));
    const carsAndObstacles = [...traffic.cars.map(footprintOfCar), ...race.obstacles];
    // Opponents see the cops' bikes, riding or waiting on the shoulder, as they see a car: they slow down in time for
    // a slower one in their path, pulling out to join the race or riding to a crash, and ride round it.
    const forTheOpponents = [
      ...carsAndObstacles,
      ...cops.filter((cop) => cop.status !== "knocked-off").map((cop) => footprintOfACopsBike(cop.motion)),
    ];
    // Riders off their bikes need no controls: their bikes slide on by themselves.
    const controls = riders.map((rider) => {
      if (rider.status !== "racing" || rider.crash) return FINISHED_CONTROLS;
      const intent = intents.get(rider);
      if (!rider.riding || !intent) return input;
      return opponentControls(rider.motion, rider.riding, track, everyoneOnABike, catchUp(rider), intent, forTheOpponents);
    });
    if (player.status === "racing" && !player.crash && !player.attack && (input.punch || input.kick)) {
      throwAttack(race, player, input.punch ? "punch" : "kick");
    }
    for (const opponent of riding) {
      if (!opponent.temperament || opponent.attack || opponent.droppingBack) continue;
      const nearest = nearestWithinReach(opponent.motion, targetsFor(race, opponent), punchOf(opponent));
      // Opponents leave the cops alone.
      if (nearest?.kind !== "rider") continue;
      // A player who doesn't fight an opponent back gets a breather after each of its hits, and is spared by those
      // waiting their turn.
      const spared = opponent.breatherSteps > 0 || waiting.has(opponent);
      if (nearest.id === PLAYER && spared && !isFightingBack(opponent.stepsSinceThePlayerHitIt)) continue;
      const kind = opponentAttack(opponent.temperament, nearest.id === PLAYER, isMidSwing(nearest.attack), random);
      // A club reaches further than a kick: a club holder swings at a rider its kick can't reach.
      if (kind) throwAttack(race, opponent, kind === "kick" && !withinReach(opponent.motion, nearest.motion, kind) ? "punch" : kind);
    }
    const copIntents = decideCops(race, everyoneOnABike, carsAndObstacles);
    const distancesBefore = riders.map((rider) => whereIs(rider).distance);
    riders.forEach((rider, index) => {
      if (!rider.crash) {
        ride(rider.motion, controls[index], track, STEP_SECONDS);
      } else {
        slide(rider.motion, edge);
        const onFoot = rider.status !== "racing" ? STAND_STILL : rider.riding ? RUN_STRAIGHT_BACK : input;
        carryOn(rider.crash, rider.motion, onFoot, edge);
        if (rider.status === "racing" && canRemount(rider.crash, rider.motion)) getBackOn(race, rider);
      }
    });
    cops.forEach((cop, index) => {
      const intent = copIntents[index];
      if (intent) moveCop(cop.motion, intent, edge);
      // A cop's bike parked on the shoulder, bumped, slides to a stop.
      if (cop.status === "waiting") slide(cop.motion, edge);
      // A knocked-off cop's bike slides to a stop while they tumble, and then they stay where they are.
      if (cop.crash) {
        slide(cop.motion, edge);
        carryOn(cop.crash, cop.motion, STAND_STILL, edge);
      }
    });
    traffic.step(whereIs(player), ridersOnTheRoad(race));
    bustTheCaught(race);
    joinThePlayer(race);
    // Riders on their bikes bump each other and the cops' bikes, or run into them and crash; a cop never crashes.
    const bikes: Fighter[] = [...riding, ...cops.filter((cop) => cop.status !== "knocked-off")];
    for (const { rider, into, speedDifference } of settleContact(bikes, edge, (bike) => bike.kind === "rider")) {
      if (rider.kind === "rider") crash(race, rider, into.kind === "cop" ? "cop" : "rider", speedDifference);
    }
    runIntoCarsAndObstacles(race, traffic.cars.map(footprintOfCar));
    advanceAttacks(race);
    recoverStamina(race);
    finishCrossings(race, distancesBefore, clockBefore);
    alertThePlayer(race);
  }
  race.stepsTaken++;
  if (race.stepsTaken === COUNTDOWN_STEPS) race.events.push({ type: "race-started" });
}

export function createRace(options: RaceOptions): Race {
  const random = createRandom(options.seed);
  const track = getCoastalTrack();
  // The player starts on the start line, between the two lanes that run in the race direction.
  const riders: Rider[] = [
    {
      ...lineUp({ id: PLAYER, name: PLAYER_NAME, temperament: null, riding: null }, track.startDistance, track.laneWidth),
      condition: Math.min(TUNING.fullCondition, options.playerCondition ?? TUNING.fullCondition),
    },
  ];
  lineUpOpponents(track, OPPONENTS.length, random).forEach(({ distance, offset }, index) => {
    const { name, temperament, skill } = OPPONENTS[index];
    const riding = { pace: paceFor(skill), lane: offset };
    riders.push(lineUp({ id: PLAYER + 1 + index, name, temperament, riding }, distance, offset));
  });
  const traffic: Traffic =
    options.traffic === false
      ? CLOSED_ROAD
      : createTraffic(
          track,
          createRandom(options.seed ^ TRAFFIC_SEED),
          riders[PLAYER].motion,
          Math.max(...riders.map((rider) => rider.motion.distance)) + CLEAR_OF_THE_GRID,
        );
  const race: RaceState = {
    seed: options.seed,
    random,
    track,
    edge: track.roadHalfWidth + track.shoulderWidth,
    riders,
    cops: options.cops === false ? [] : lineUpCops(track),
    traffic,
    obstacles: track.obstacles.map(footprintOfObstacle),
    events: [],
    stepsTaken: 0,
    finishers: 0,
    playerBustedBy: null,
    rota: { breakSteps: 0 },
    playersFighter: null,
  };

  return {
    track,
    step: (input) => step(race, input),
    snapshot: () => snapshotOf(race),
    drainEvents: () => race.events.splice(0),
    fastForward(steps = Infinity) {
      const outcome = riders[PLAYER].status;
      if (outcome === "racing") {
        throw new Error("The player is still racing: fast-forward only once the player's race is over");
      }
      const done = () => !riders.some((rider) => rider.status === "racing") || race.stepsTaken >= FAST_FORWARD_UNTIL_STEPS;
      for (let taken = 0; taken < steps && !done(); taken++) step(race, NO_INPUT);
      return results(race, outcome, done());
    },
  };
}
