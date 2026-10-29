import { getCoastalTrack } from "./coastal-track";
import { settleContact } from "./contact";
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
import type { AttackKind, CrashCause, RaceEvent, RaceOutcome, RiderId } from "./events";
import { lineUpOpponents } from "./field";
import {
  attackStage,
  attackSteps,
  awayFrom,
  isMidSwing,
  nearestWithinReach,
  windUpSteps,
  type Attack,
  type Weapon,
} from "./fighting";
import { isDroppingBack, opponentAttack, opponentIntent } from "./opponent-fighting";
import { catchUpFor, opponentControls, paceFor, type OpponentRiding } from "./opponent-riding";
import { OPPONENTS, PLAYER_NAME, type Temperament } from "./opponents";
import { createRandom } from "./random";
import { ride, type Controls, type Motion } from "./riding";
import { STEP_SECONDS, STEPS_PER_SECOND, stepsIn } from "./steps";
import { nearestOpponent, warningsFor, type Warnings } from "./surroundings";
import type { Track } from "./track";
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
  /** Null while the rider is on their bike; after a crash, "tumbling" and then "on-foot" until they remount. */
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
  /** The opponent on their bike nearest the player, whose name and stamina the HUD shows; null when none is within 50 m. */
  readonly nearestOpponent: RiderId | null;
  /** Opponents alongside the player, or coming up from behind, on either side of them. */
  readonly warnings: Warnings;
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
    motion: { distance, offset, speed: 0, steering: 0, shove: 0 },
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

  const clock = () => Math.max(0, stepsTaken - COUNTDOWN_STEPS) / STEPS_PER_SECOND;

  /** Riders still racing on their bikes: the ones who ride, bump and fight. */
  const onTheirBikes = () => riders.filter((rider) => rider.status === "racing" && !rider.crash);
  const edge = track.roadHalfWidth + track.shoulderWidth;

  /** The riders an attack can be aimed at. */
  const targets = onTheirBikes;

  /** A rider's punch: a club holder swings their club instead. */
  const punchOf = (rider: Rider): AttackKind => (rider.weapon === "club" ? "club-swing" : "punch");

  /**
   * Starts an attack's wind-up, aimed at the nearest rider within reach (if
   * any): towards them, or else to the right. A punch from a club holder is a
   * club swing.
   */
  function throwAttack(attacker: Rider, thrown: AttackKind) {
    const kind = thrown === "punch" ? punchOf(attacker) : thrown;
    const target = nearestWithinReach(attacker.motion, targets(), kind);
    attacker.attack = { kind, steps: 0, side: target ? awayFrom(attacker.motion, target.motion) : 1 };
    events.push({
      type: "attack-thrown",
      attacker: { kind: "rider", id: attacker.id },
      target: target && { kind: "rider", id: target.id },
      kind,
    });
  }

  /** Moves every attack on by a step: each strikes at the end of its wind-up and is over after its recovery. */
  function advanceAttacks() {
    for (const attacker of riders) {
      const attack = attacker.attack;
      if (!attack) continue;
      attack.steps++;
      if (attack.steps === windUpSteps(attack.kind) && attacker.status === "racing" && !attacker.crash) {
        const target = nearestWithinReach(attacker.motion, targets(), attack.kind);
        if (target) {
          attack.side = awayFrom(attacker.motion, target.motion);
          land(attacker, target, attack.kind);
        }
      }
      if (attack.steps >= attackSteps(attack.kind)) attacker.attack = null;
    }
  }

  function land(attacker: Rider, target: Rider, kind: AttackKind) {
    events.push({
      type: "attack-landed",
      attacker: { kind: "rider", id: attacker.id },
      target: { kind: "rider", id: target.id },
      kind,
    });
    // Any hit in the middle of a club swing takes the club from its holder, and their swing never lands.
    if (isMidSwing(target.attack)) {
      target.weapon = null;
      target.attack = null;
      attacker.weapon = "club";
      events.push({ type: "weapon-stolen", from: { kind: "rider", id: target.id }, by: { kind: "rider", id: attacker.id } });
    }
    const { stamina, shove } = TUNING.attacks[kind];
    // A kick shoves its target sideways, away from the attacker.
    if (shove > 0) target.motion.shove = awayFrom(attacker.motion, target.motion) * shove;
    // A hit on a rider with no stamina left knocks them off their bike.
    if (target.stamina <= 0) crash(target, "knocked-off", target.motion.speed);
    target.stamina = Math.max(0, target.stamina - stamina);
    target.stepsSinceHit = 0;
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
    }
  }

  /** A rider on foot who has reached their bike rides off on it again, with at least some stamina. */
  function getBackOn(rider: Rider) {
    rider.crash = null;
    remount(rider.motion);
    rider.stamina = Math.max(rider.stamina, TUNING.remountStamina);
    events.push({ type: "remounted", rider: rider.id });
  }

  /** Riders who have gone long enough without being hit get their stamina back, a little every step. */
  function recoverStamina() {
    for (const rider of riders) {
      rider.stepsSinceHit++;
      if (rider.stepsSinceHit > RECOVERY_DELAY_STEPS) {
        rider.stamina = Math.min(TUNING.fullStamina, rider.stamina + TUNING.staminaRecovery * STEP_SECONDS);
      }
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
    return {
      outcome,
      time: riders[PLAYER].finishTime,
      position,
      qualified: outcome === "finished" && position !== null && position <= QUALIFYING_POSITION,
      standings,
    };
  }

  const race: Race = {
    track,
    step(input) {
      if (stepsTaken >= COUNTDOWN_STEPS) {
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
        // Riders off their bikes need no controls: their bikes slide on by themselves.
        const controls = riders.map((rider) => {
          if (rider.status !== "racing" || rider.crash) return FINISHED_CONTROLS;
          if (!rider.riding || !rider.temperament) return input;
          const intent = opponentIntent(rider.temperament, rider.motion, playerToFight, rider.droppingBack);
          return opponentControls(rider.motion, rider.riding, track, field, catchUp(rider), intent);
        });
        if (player.status === "racing" && !player.crash && !player.attack && (input.punch || input.kick)) {
          throwAttack(player, input.punch ? "punch" : "kick");
        }
        for (const opponent of riding) {
          if (!opponent.temperament || opponent.attack || opponent.droppingBack) continue;
          const nearest = nearestWithinReach(opponent.motion, riding, punchOf(opponent));
          const kind = nearest && opponentAttack(opponent.temperament, nearest.id === PLAYER, random);
          if (kind) throwAttack(opponent, kind);
        }
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
        for (const { rider, speedDifference } of settleContact(riding, edge)) crash(rider, "rider", speedDifference);
        advanceAttacks();
        recoverStamina();
        finishCrossings(distancesBefore, clockBefore);
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
        nearestOpponent: nearestOpponent(player, opponents),
        warnings: warningsFor(player, opponents),
        riders: riders.map((rider) => {
          const { distance, offset, speed } = whereIs(rider);
          return {
            id: rider.id,
            name: rider.name,
            temperament: rider.temperament,
            distance,
            offset,
            speed,
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
