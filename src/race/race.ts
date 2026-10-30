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
  standingByIntent,
  type Cop,
  type CopIntent,
  type CopStatus,
  type Rota,
} from "./cops";
import {
  canRemount,
  carryOn,
  remount,
  slide,
  throwOff,
  type Crash,
  type CrashPhase,
  type OnFootControls,
} from "./crashing";
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
import { footprintOfCar, footprintOfObstacle, type Footprint } from "./footprint";
import { isDroppingBack, opponentAttack, opponentIntent } from "./opponent-fighting";
import { catchUpFor, opponentControls, paceFor, type OpponentRiding } from "./opponent-riding";
import { OPPONENTS, PLAYER_NAME, type Temperament } from "./opponents";
import { createRandom } from "./random";
import { remarkOn, type Ending, type Remark } from "./remarks";
import { isOffRoad, ride, type Controls, type Motion } from "./riding";
import { STEP_SECONDS, STEPS_PER_SECOND, stepsIn } from "./steps";
import { nearestOpponentOrCop, warningsFor, type Warnings } from "./surroundings";
import type { Track } from "./track";
import { CLOSED_ROAD, createTraffic, type CarKind, type Traffic } from "./traffic";
import { TUNING } from "./tuning";

/** The player is always rider 0. */
export const PLAYER: RiderId = 0;

/** The 3-2-1 countdown lasts three seconds. */
const COUNTDOWN_STEPS = 3 * STEPS_PER_SECOND;

/** Once over the finish line, a rider lets go of the throttle and brakes to a stop. */
const FINISHED_CONTROLS: Controls = { throttle: 0, brake: 0.7, steer: 0 };

/** Opponents on foot run straight back to their bikes. */
const RUN_STRAIGHT_BACK: OnFootControls = { steer: 0, brake: 0 };

/** A rider whose race is over stays where they are once they are on their feet. */
const STAND_STILL: OnFootControls = { steer: 0, brake: 1 };

const KMH_PER_METRE_PER_SECOND = 3.6;

/** Fast-forwarding races the rest of the field for at most three extra simulated minutes. */
const FAST_FORWARD_STEPS = 180 * STEPS_PER_SECOND;

/** Finishing in this position or better qualifies. */
const QUALIFYING_POSITION = 3;

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

/** Whether a rider is still racing, or how their race ended. */
export type RiderStatus = "racing" | RaceOutcome;

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
   * Every rider: finishers in finishing order, then anyone still racing when
   * the fast-forward ran out of time, by distance, then wrecked and busted riders.
   */
  readonly standings: readonly Standing[];
  /** A one-line remark on how the player's race went, chosen with the race's seed. */
  readonly remark: Remark;
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
   * Once the player's race is over, races the rest of the field to the finish
   * (for at most three extra simulated minutes, with the player's input
   * released) and returns the final results. Events emitted on the way are
   * queued as usual. Throws while the player is still racing.
   */
  fastForward(): RaceResults;
}

interface Rider {
  readonly kind: "rider";
  readonly id: RiderId;
  readonly name: string;
  readonly temperament: Temperament | null;
  /** The bike's motion, which is the rider's too while they ride it. */
  readonly motion: Motion;
  /** How an opponent rides; null for the player, whose input comes from outside. */
  readonly riding: OpponentRiding | null;
  status: RiderStatus;
  finishTime: number | null;
  /** 1 for the first rider over the finish line, 2 for the next, and so on. */
  finishOrder: number | null;
  stamina: number;
  /** The bike's condition. */
  condition: number;
  /** Steps since the rider was last hit (Infinity if never). */
  stepsSinceHit: number;
  /** The attack the rider is making, or null. */
  attack: Attack | null;
  /** The weapon the rider holds, or null. */
  weapon: Weapon | null;
  /** Null while the rider is on their bike; how they are getting back to it after a crash. */
  crash: Crash | null;
  /** Whether an opponent is badly beaten and dropping back until it has recovered. */
  droppingBack: boolean;
}

/** Where a rider is: on their bike, or wherever they are after being thrown off it. */
function whereIs(rider: Rider): { readonly distance: number; readonly offset: number; readonly speed: number } {
  return rider.crash ? rider.crash.body : rider.motion;
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

export function createRace(options: RaceOptions): Race {
  const random = createRandom(options.seed);
  const track = getCoastalTrack();
  let stepsTaken = 0;
  let events: RaceEvent[] = [];
  let finishers = 0;
  /**
   * A rider on the grid: fresh, on a bike in perfect condition, standing at
   * `distance` and `offset`. Bullies start the race with a club.
   */
  const lineUp = (
    rider: Pick<Rider, "id" | "name" | "temperament" | "riding">,
    distance: number,
    offset: number,
  ): Rider => ({
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
  });
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
  /** Where the obstacles stand: they never move. */
  const obstacles = track.obstacles.map(footprintOfObstacle);
  const cops = options.cops === false ? [] : lineUpCops(track);
  /** The cop who busted the player, once one has. */
  let playerBustedBy: Cop | null = null;
  /** The cops' turns at following the player. */
  const rota: Rota = { breakSteps: 0 };

  const clock = () => Math.max(0, stepsTaken - COUNTDOWN_STEPS) / STEPS_PER_SECOND;

  /** Riders still racing on their bikes: the ones who ride, bump and fight. */
  const onTheirBikes = () => riders.filter((rider) => rider.status === "racing" && !rider.crash);
  const edge = track.roadHalfWidth + track.shoulderWidth;

  /** Cops riding in the race: the ones who patrol, bust riders and fight. */
  const copsInTheRace = () => cops.filter((cop) => cop.status === "riding");

  /** Whether a fighter is in a fight: on their bike in the race. */
  const canFight = (fighter: Fighter) =>
    fighter.kind === "rider" ? fighter.status === "racing" && !fighter.crash : fighter.status === "riding";

  /** Whom a fighter's attacks can land on: riders on their bikes, and cops in the race too for a rider. */
  const targetsFor = (attacker: Fighter): Fighter[] =>
    attacker.kind === "rider" ? [...onTheirBikes(), ...copsInTheRace()] : onTheirBikes();

  /** A fighter's punch: a club holder swings their club instead. */
  const punchOf = (fighter: Fighter): AttackKind => (fighter.weapon === "club" ? "club-swing" : "punch");

  /**
   * Starts an attack's wind-up, aimed at the nearest rider or cop within reach
   * (if any): towards them, or else to the right. A punch from a club holder
   * is a club swing.
   */
  function throwAttack(attacker: Fighter, thrown: AttackKind) {
    const kind = thrown === "punch" ? punchOf(attacker) : thrown;
    const target = nearestWithinReach(attacker.motion, targetsFor(attacker), kind);
    attacker.attack = {
      kind,
      steps: 0,
      side: target ? awayFrom(attacker.motion, target.motion) : 1,
      thrownMidSwingAt: target && isMidSwing(target.attack) ? who(target) : null,
    };
    events.push({ type: "attack-thrown", attacker: who(attacker), target: target && who(target), kind });
  }

  /** Moves every attack on by a step: each strikes at the end of its wind-up and is over after its recovery. */
  function advanceAttacks() {
    for (const attacker of [...riders, ...cops]) {
      const attack = attacker.attack;
      if (!attack) continue;
      attack.steps++;
      if (attack.steps === windUpSteps(attack.kind) && canFight(attacker)) {
        const target = nearestWithinReach(attacker.motion, targetsFor(attacker), attack.kind);
        if (target) {
          attack.side = awayFrom(attacker.motion, target.motion);
          land(attacker, target, attack);
        }
      }
      if (attack.steps >= attackSteps(attack.kind)) attacker.attack = null;
    }
  }

  function land(attacker: Fighter, target: Fighter, { kind, thrownMidSwingAt }: Attack) {
    events.push({ type: "attack-landed", attacker: who(attacker), target: who(target), kind });
    // Any hit a rider throws at another rider winding up a club swing takes the club, and the swing, if it hasn't
    // struck, never does. Cops neither take clubs nor lose them.
    const intoTheSwing = thrownMidSwingAt?.kind === target.kind && thrownMidSwingAt.id === target.id;
    if (attacker.kind === "rider" && target.kind === "rider" && intoTheSwing && target.weapon === "club") {
      target.weapon = null;
      target.attack = null;
      attacker.weapon = "club";
      events.push({ type: "weapon-stolen", from: who(target), by: who(attacker) });
    }
    const { stamina, shove } = TUNING.attacks[kind];
    // A kick shoves its target sideways, away from the attacker.
    if (shove > 0) target.motion.kickShove = awayFrom(attacker.motion, target.motion) * shove;
    // A hit on a rider or cop with no stamina left knocks them off their bike.
    if (target.stamina <= 0) {
      if (target.kind === "rider") crash(target, "knocked-off", target.motion.speed);
      else knockOff(target);
    }
    target.stamina = Math.max(0, target.stamina - stamina);
    target.stepsSinceHit = 0;
    if (target.kind === "cop" && attacker.kind === "rider" && target.status === "riding") fightBack(target, attacker);
  }

  /** Knocks a cop off their bike and out of the race for good, dropping their club. */
  function knockOff(cop: Cop) {
    events.push({ type: "cop-knocked-off", cop: cop.id, impactSpeed: cop.motion.speed });
    cop.status = "knocked-off";
    cop.crash = throwOff(cop.motion);
    cop.attack = null;
    cop.weapon = null;
    cop.busting = null;
    cop.fightingBack = null;
  }

  /** A cop hit by a rider fights back against them, until a while after it was last hit. */
  function fightBack(cop: Cop, rider: Rider) {
    if (cop.fightingBack !== rider.id) events.push({ type: "cop-retaliating", cop: cop.id, target: rider.id });
    cop.fightingBack = rider.id;
    cop.fightingBackSteps = stepsIn(TUNING.cops.fightingBackSeconds);
  }

  /**
   * What every cop does this step, from where things stand: rides to bust a
   * crashed rider who hasn't got away yet; or fights back against the rider
   * who hit it, riding alongside them and swinging at them when they are
   * within reach; or stands by a rider it has just busted; or else patrols
   * near the player. Cops find their way around everyone on a bike, the
   * riders (`field`) and each other, and the cars and obstacles on the road.
   * Returns each cop's intent, or null for a cop not riding in the race.
   */
  function decideCops(field: readonly Readonly<Motion>[], carsAndObstacles: readonly Footprint[]): (CopIntent | null)[] {
    letGo();
    for (const cop of copsInTheRace()) {
      const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
      cop.fightingBackSteps = Math.max(0, cop.fightingBackSteps - 1);
      if (fighting && (cop.fightingBackSteps === 0 || fighting.status !== "racing")) cop.fightingBack = null;
      cop.attackCooldownSteps = Math.max(0, cop.attackCooldownSteps - 1);
      cop.standingBySteps = Math.max(0, cop.standingBySteps - 1);
    }
    for (const cop of copsInTheRace()) {
      const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
      if (!fighting || fighting.crash || cop.busting !== null || cop.attack || cop.attackCooldownSteps > 0) continue;
      if (!withinReach(cop.motion, fighting.motion, punchOf(cop))) continue;
      throwAttack(cop, "punch");
      cop.attackCooldownSteps = stepsIn(COP_ATTACK_EVERY_SECONDS);
    }
    const player = whereIs(riders[PLAYER]);
    takeTurns(cops, rota, player, (cop) => cop.busting !== null || cop.fightingBack !== null || cop.standingBySteps > 0);
    const everyoneOnABike = [...field, ...copsInTheRace().map((cop) => cop.motion)];
    return cops.map((cop) => {
      if (cop.status !== "riding") return null;
      if (cop.busting !== null) return bustingIntent(cop.motion, whereIs(riders[cop.busting]), edge);
      const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
      if (fighting && !fighting.crash) {
        return fightingBackIntent(cop.motion, fighting.motion, track, everyoneOnABike, carsAndObstacles);
      }
      if (cop.standingBySteps > 0) return standingByIntent(cop.motion);
      return patrolIntent(cop.motion, player, cop.following, track, everyoneOnABike, carsAndObstacles);
    });
  }

  /**
   * Throws a rider off their bike, which loses condition; a bike whose
   * condition runs out is wrecked, and so is the rider's race. A rider who
   * crashes drops their club, which is lost.
   */
  function crash(rider: Rider, cause: CrashCause, impactSpeed: number) {
    events.push({ type: "crash", rider: rider.id, cause, impactSpeed });
    rider.attack = null;
    rider.weapon = null;
    rider.crash = throwOff(rider.motion);
    const loss = TUNING.crashConditionLoss + TUNING.crashConditionLossPerKmh * impactSpeed * KMH_PER_METRE_PER_SECOND;
    rider.condition = Math.max(0, rider.condition - loss);
    if (rider.condition === 0) {
      rider.status = "wrecked";
      events.push({ type: "wrecked", rider: rider.id });
      if (rider.id === PLAYER) events.push({ type: "player-race-over", outcome: "wrecked" });
    } else {
      sendCopsTo(rider);
    }
  }

  /**
   * Every cop in the race within busting range of a rider who has just
   * crashed rides to them, unless it is busting someone already.
   */
  function sendCopsTo(rider: Rider) {
    for (const cop of copsInTheRace()) {
      if (cop.busting === null && apart(cop.motion, whereIs(rider)) <= TUNING.cops.bustingRange) cop.busting = rider.id;
    }
  }

  /** Cops stop riding to crashed riders who are back on their bikes, or whose race is over: they got away. */
  function letGo() {
    for (const cop of cops) {
      const rider = cop.busting === null ? null : riders[cop.busting];
      if (rider && (rider.status !== "racing" || !rider.crash)) cop.busting = null;
    }
  }

  /**
   * A cop that has reached the crashed rider it was riding to busts them,
   * ending their race, once they are on their feet: never while they tumble.
   */
  function bustTheCaught() {
    for (const cop of cops) {
      const rider = cop.busting === null ? null : riders[cop.busting];
      if (rider?.crash?.phase !== "on-foot" || rider.status !== "racing") continue;
      if (apart(cop.motion, whereIs(rider)) > TUNING.cops.bustingReach) continue;
      rider.status = "busted";
      cop.busting = null;
      cop.standingBySteps = stepsIn(TUNING.cops.standingBySeconds);
      events.push({ type: "busted", rider: rider.id, cop: cop.id });
      if (rider.id === PLAYER) {
        playerBustedBy = cop;
        events.push({ type: "player-race-over", outcome: "busted" });
      }
    }
  }

  /**
   * Riders on their bikes who run into the `cars` (by their footprints) or
   * obstacles crash, or bump off them at a small speed difference; a car
   * that runs into a rider on foot knocks them down.
   */
  function runIntoCarsAndObstacles(cars: readonly Footprint[]) {
    for (const [footprints, cause] of [
      [cars, "traffic"],
      [obstacles, "obstacle"],
    ] as const) {
      for (const { rider, footprint, speedDifference } of settleImpacts(onTheirBikes(), footprints, edge)) {
        crash(rider, cause, speedDifference);
        if (rider.crash) throwClearOf(footprint, rider.motion, rider.crash.body, edge);
      }
    }
    for (const rider of riders) {
      if (rider.status !== "racing" || rider.crash?.phase !== "on-foot") continue;
      const car = carRunningInto(rider.crash.body, cars);
      if (car) events.push({ type: "knocked-down", rider: rider.id, impactSpeed: knockDownBy(car, rider.crash) });
    }
  }

  /** A rider on foot who has reached their bike rides off on it again, with at least some stamina. */
  function getBackOn(rider: Rider) {
    rider.crash = null;
    remount(rider.motion);
    rider.stamina = Math.max(rider.stamina, TUNING.remountStamina);
    events.push({ type: "remounted", rider: rider.id });
  }

  /** Riders and cops who have gone long enough without being hit get their stamina back, a little every step. */
  function recoverStamina() {
    for (const fighter of [...riders, ...cops]) {
      fighter.stepsSinceHit++;
      if (fighter.stepsSinceHit > RECOVERY_DELAY_STEPS) {
        const full = fighter.kind === "rider" ? TUNING.fullStamina : TUNING.cops.fullStamina;
        fighter.stamina = Math.min(full, fighter.stamina + TUNING.staminaRecovery * STEP_SECONDS);
      }
    }
  }

  /** Cops waiting on the shoulder join the race once the player, still racing, has passed them. */
  function joinThePlayer() {
    const player = riders[PLAYER];
    if (player.status !== "racing") return;
    for (const cop of cops) {
      if (cop.status === "waiting" && whereIs(player).distance >= cop.motion.distance) cop.status = "riding";
    }
  }

  /** Says which cops have come near the player, and which have gone: cops in the race within their alert range of the player. */
  function alertThePlayer() {
    for (const cop of cops) {
      const near = cop.status === "riding" && apart(cop.motion, whereIs(riders[PLAYER])) <= TUNING.cops.alertRange;
      if (near === cop.near) continue;
      cop.near = near;
      events.push({ type: near ? "cop-near" : "cop-gone", cop: cop.id });
    }
  }

  /** Finishes the riders who crossed the finish line during the step that began at `clockBefore`, in the order they crossed it. */
  function finishCrossings(distancesBefore: readonly number[], clockBefore: number) {
    const crossings = riders
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
      rider.finishOrder = ++finishers;
      events.push({ type: "rider-finished", rider: rider.id, time, position: rider.finishOrder });
      if (rider.id === PLAYER) events.push({ type: "player-race-over", outcome: "finished" });
    }
  }

  /**
   * The riders who have a position, best first: finishers in finishing order,
   * then riders still racing by distance travelled. Wrecked and busted riders
   * have no position.
   */
  function ranking() {
    const finished = riders
      .filter((rider) => rider.status === "finished")
      .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0));
    const racing = riders
      .filter((rider) => rider.status === "racing")
      .sort((a, b) => whereIs(b).distance - whereIs(a).distance);
    return [...finished, ...racing];
  }

  function positions() {
    return new Map(ranking().map((rider, index) => [rider.id, index + 1]));
  }

  function results(outcome: RaceOutcome): RaceResults {
    const standing = (rider: Rider, position: number | null): Standing => ({
      rider: rider.id,
      name: rider.name,
      status: rider.status,
      position,
      time: rider.finishTime,
    });
    const unplaced = riders.filter((rider) => rider.status === "wrecked" || rider.status === "busted");
    const standings = [
      ...ranking().map((rider, index) => standing(rider, index + 1)),
      ...unplaced.map((rider) => standing(rider, null)),
    ];
    const position = standings.find((entry) => entry.rider === PLAYER)?.position ?? null;
    const qualified = outcome === "finished" && position !== null && position <= QUALIFYING_POSITION;
    const opponents = standings.flatMap(({ rider, name, position }) => {
      const { temperament } = riders[rider];
      return temperament ? [{ id: rider, name, temperament, position }] : [];
    });
    const remark = remarkOn(endingFor(outcome, position, qualified), opponents, createRandom(options.seed ^ REMARK_SEED));
    return { outcome, time: riders[PLAYER].finishTime, position, qualified, standings, remark };
  }

  /** How the player's race ended, for the remark on it: a race that neither finished nor got them busted wrecked their bike. */
  function endingFor(outcome: RaceOutcome, position: number | null, qualified: boolean): Ending {
    if (outcome === "busted" && playerBustedBy) return { outcome, cop: { id: playerBustedBy.id, name: playerBustedBy.name } };
    if (outcome === "finished" && position !== null) return { outcome, position, qualified };
    return { outcome: "wrecked" };
  }

  const race: Race = {
    track,
    step(input) {
      // The traffic drives on whatever the riders do, even while they wait for the countdown.
      if (stepsTaken < COUNTDOWN_STEPS) traffic.step(whereIs(riders[PLAYER]));
      else {
        const clockBefore = clock();
        // Everyone decides what to do from where things stand, then everyone moves.
        const riding = onTheirBikes();
        const field = riding.map((rider) => rider.motion);
        const player = riders[PLAYER];
        // Catch-up keeps the field near the player, so it stops once the player's race is over.
        const catchUp = (rider: Rider) =>
          player.status === "racing" ? catchUpFor(rider.motion.distance - whereIs(player).distance) : 1;
        const playerToFight = player.status === "racing" && !player.crash ? player.motion : null;
        for (const rider of riding) {
          if (rider.riding) rider.droppingBack = isDroppingBack(rider.droppingBack, rider.stamina);
        }
        const carsAndObstacles = [...traffic.cars.map(footprintOfCar), ...obstacles];
        // Riders off their bikes need no controls: their bikes slide on by themselves.
        const controls = riders.map((rider) => {
          if (rider.status !== "racing" || rider.crash) return FINISHED_CONTROLS;
          if (!rider.riding || !rider.temperament) return input;
          const intent = opponentIntent(rider.temperament, rider.motion, playerToFight, rider.droppingBack);
          return opponentControls(rider.motion, rider.riding, track, field, catchUp(rider), intent, carsAndObstacles);
        });
        if (player.status === "racing" && !player.crash && !player.attack && (input.punch || input.kick)) {
          throwAttack(player, input.punch ? "punch" : "kick");
        }
        for (const opponent of riding) {
          if (!opponent.temperament || opponent.attack || opponent.droppingBack) continue;
          const nearest = nearestWithinReach(opponent.motion, targetsFor(opponent), punchOf(opponent));
          // Opponents leave the cops alone.
          if (nearest?.kind !== "rider") continue;
          const kind = opponentAttack(opponent.temperament, nearest.id === PLAYER, isMidSwing(nearest.attack), random);
          // A club reaches further than a kick: a club holder swings at a rider its kick can't reach.
          if (kind) throwAttack(opponent, kind === "kick" && !withinReach(opponent.motion, nearest.motion, kind) ? "punch" : kind);
        }
        const copIntents = decideCops(field, carsAndObstacles);
        const distancesBefore = riders.map((rider) => whereIs(rider).distance);
        riders.forEach((rider, index) => {
          if (!rider.crash) {
            ride(rider.motion, controls[index], track, STEP_SECONDS);
          } else {
            slide(rider.motion, edge);
            const onFoot = rider.status !== "racing" ? STAND_STILL : rider.riding ? RUN_STRAIGHT_BACK : input;
            carryOn(rider.crash, rider.motion, onFoot, edge);
            if (rider.status === "racing" && canRemount(rider.crash, rider.motion)) getBackOn(rider);
          }
        });
        cops.forEach((cop, index) => {
          const intent = copIntents[index];
          if (intent) moveCop(cop.motion, intent, edge);
          // A knocked-off cop's bike slides to a stop while they tumble, and then they stay where they are.
          if (cop.crash) {
            slide(cop.motion, edge);
            carryOn(cop.crash, cop.motion, STAND_STILL, edge);
          }
        });
        traffic.step(whereIs(player));
        bustTheCaught();
        joinThePlayer();
        for (const { rider, speedDifference } of settleContact(riding, edge)) crash(rider, "rider", speedDifference);
        runIntoCarsAndObstacles(traffic.cars.map(footprintOfCar));
        advanceAttacks();
        recoverStamina();
        finishCrossings(distancesBefore, clockBefore);
        alertThePlayer();
      }
      stepsTaken++;
      if (stepsTaken === COUNTDOWN_STEPS) events.push({ type: "race-started" });
    },
    snapshot() {
      const ranks = positions();
      const player = { id: PLAYER, ...whereIs(riders[PLAYER]) };
      const opponents = onTheirBikes()
        .filter((rider) => rider.id !== PLAYER)
        .map(({ id, motion: { distance, offset, speed } }) => ({ id, distance, offset, speed }));
      return {
        countdown: Math.max(0, COUNTDOWN_STEPS - stepsTaken) / STEPS_PER_SECOND,
        clock: clock(),
        nearestOpponentOrCop: nearestOpponentOrCop(player, [
          ...opponents.map(({ id, distance, offset }) => ({ who: { kind: "rider", id } as const, distance, offset })),
          ...copsInTheRace().map((cop) => ({ who: who(cop), distance: cop.motion.distance, offset: cop.motion.offset })),
        ]),
        warnings: warningsFor(player, [...opponents, ...copsInTheRace().map(({ motion }) => motion)]),
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
    },
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
    fastForward() {
      const outcome = riders[PLAYER].status;
      if (outcome === "racing") {
        throw new Error("The player is still racing: fast-forward only once the player's race is over");
      }
      const limit = stepsTaken + FAST_FORWARD_STEPS;
      while (riders.some((rider) => rider.status === "racing") && stepsTaken < limit) race.step(NO_INPUT);
      return results(outcome);
    },
  };
  return race;
}
