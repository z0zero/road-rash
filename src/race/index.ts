/**
 * The Race module: the whole game's rules as a pure, deterministic simulation
 * (ADR 0004). Import it only through this file.
 */
export { createRace, NO_INPUT, PLAYER, STEP_SECONDS } from "./race";
export type { PlayerInput, Race, RaceOptions, RaceSnapshot, RiderSnapshot } from "./race";
export type { Track } from "./track";
export type {
  AttackKind,
  CopId,
  CrashCause,
  RaceEvent,
  RaceOutcome,
  RiderId,
  RiderOrCop,
} from "./events";
