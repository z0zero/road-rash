import type { Cop, Rota } from "./cops";
import type { DifficultyTuning } from "./difficulty";
import type { RaceEvent } from "./events";
import type { Footprint } from "./footprint";
import type { Random } from "./random";
import type { Rider } from "./riders";
import { STEPS_PER_SECOND } from "./steps";
import type { Track } from "./track";
import type { Traffic } from "./traffic";

/** The 3-2-1 countdown lasts three seconds. */
export const COUNTDOWN_STEPS = 3 * STEPS_PER_SECOND;

/**
 * Everything a race keeps track of as it runs: what its rules read and change,
 * step by step. Only the Race module's own rules see it; the rest of the game
 * reads snapshots, events and results.
 */
export interface RaceState {
  /** Seeds every random choice the race makes. */
  readonly seed: number;
  /** How the opponents ride and fight on the race's difficulty. */
  readonly difficultyTuning: DifficultyTuning;
  /** The riders' random choices; the traffic and the remark draw from generators of their own. */
  readonly random: Random;
  readonly track: Track;
  /** How far either side of the centreline anyone goes (metres): to the far side of either shoulder. */
  readonly edge: number;
  /** Every rider, indexed by `RiderId`: the player, then the opponents. */
  readonly riders: readonly Rider[];
  /** Every cop, indexed by `CopId`. */
  readonly cops: readonly Cop[];
  readonly traffic: Traffic;
  /** Where the obstacles stand: they never move. */
  readonly obstacles: readonly Footprint[];
  /** Every event emitted since the last drain, oldest first. */
  readonly events: RaceEvent[];
  /** Steps taken since the race was created, the countdown's included. */
  stepsTaken: number;
  /** How many riders have crossed the finish line. */
  finishers: number;
  /** The cop who busted the player, once one has. */
  playerBustedBy: Cop | null;
  /** The cops' turns at following the player. */
  readonly rota: Rota;
  /** The brawler or bully whose turn it is to fight the player, if any. */
  playersFighter: Rider | null;
}

/** Riders still racing on their bikes: the ones who ride, bump and fight. */
export function onTheirBikes(race: RaceState): Rider[] {
  return race.riders.filter((rider) => rider.status === "racing" && !rider.crash);
}

/** Cops riding in the race: the ones who patrol, bust riders and fight. */
export function copsInTheRace(race: RaceState): Cop[] {
  return race.cops.filter((cop) => cop.status === "riding");
}

/** The race clock: seconds since the start, 0 during the countdown. */
export function clock(race: RaceState): number {
  return Math.max(0, race.stepsTaken - COUNTDOWN_STEPS) / STEPS_PER_SECOND;
}
