import type { AttackKind, CopId, RiderId, RiderOrCop } from "./events";
import type { CopStatus } from "./cops";
import type { CrashPhase } from "./crashing";
import { attackStage, who, type Weapon } from "./fighting";
import type { Temperament } from "./opponents";
import { clock, COUNTDOWN_STEPS, copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import { positions } from "./results";
import { isPlayer, PLAYER, whereIs, type RiderStatus } from "./riders";
import { isOffRoad } from "./riding";
import { STEPS_PER_SECOND } from "./steps";
import { nearestOpponentOrCop, warningsFor, type Warnings } from "./surroundings";
import type { Moving, Side } from "./track";
import type { CarKind } from "./traffic";

/** A rider, where they are: on their bike, or off it after a crash. */
export interface RiderSnapshot extends Moving {
  readonly id: RiderId;
  /** The opponent's nickname, or "You" for the player. */
  readonly name: string;
  /** How the opponent races and fights; null for the player. */
  readonly temperament: Temperament | null;
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
  /** Whether the rider, on foot by their bike, is waiting for a car to go by before getting back on it: the HUD says "Car coming!" while the player is. */
  readonly waitingForACar: boolean;
  /** Where the rider's bike is: under them while they ride it, or wherever it slid to after a crash. */
  readonly bike: BikeSnapshot;
}

/** An attack under way: it winds up, strikes at the end of its wind-up, then recovers before the next. */
export interface AttackSnapshot {
  readonly kind: AttackKind;
  /** Which way the attack goes: to the attacker's right or left. */
  readonly side: Side;
  readonly stage: "wind-up" | "recovery";
  /** How far through its stage the attack is, from 0 to 1. */
  readonly progress: number;
}

/** Where a bike is, and how fast it goes along the track. */
export type BikeSnapshot = Moving;

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

/** A cop on a motorcycle, as the riders see them, where they are: on their bike, or off it once knocked off. */
export interface CopSnapshot extends Moving {
  readonly id: CopId;
  readonly name: string;
  readonly status: CopStatus;
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

/** Where something is in track space, and how fast it goes along the track, as plain data. */
function movingOf({ distance, offset, speed }: Moving): Moving {
  return { distance, offset, speed };
}

/** Everything visible in the race right now, as plain data. */
export function snapshotOf(race: RaceState): RaceSnapshot {
  const { riders, cops, track, traffic } = race;
  const positionOf = positions(race);
  const player = { id: PLAYER, ...whereIs(riders[PLAYER]) };
  const opponents = onTheirBikes(race)
    .filter((rider) => !isPlayer(rider))
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
        position: positionOf.get(rider.id) ?? null,
        finishTime: rider.finishTime,
        stamina: rider.stamina,
        condition: rider.condition,
        attack: rider.attack && { kind: rider.attack.kind, side: rider.attack.side, ...attackStage(rider.attack) },
        weapon: rider.weapon,
        crash: rider.crash?.phase ?? null,
        waitingForACar: rider.status === "racing" && rider.crash?.waitingForACar === true,
        bike: movingOf(rider.motion),
      };
    }),
    cops: cops.map((cop) => ({
      id: cop.id,
      name: cop.name,
      status: cop.status,
      ...movingOf(cop.crash ? cop.crash.body : cop.motion),
      stamina: cop.stamina,
      attack: cop.attack && { kind: cop.attack.kind, side: cop.attack.side, ...attackStage(cop.attack) },
      weapon: cop.weapon,
      crash: cop.crash?.phase ?? null,
      bike: movingOf(cop.motion),
      busting: cop.busting,
      fightingBack: cop.fightingBack,
      near: cop.near,
    })),
  };
}
