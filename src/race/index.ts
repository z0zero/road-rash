/**
 * The Race module: the whole game's rules as a pure, deterministic simulation
 * in track space (ADR 0004). Import it only through this file.
 *
 *   const race = createRace({ seed });
 *   race.step(input);          // exactly STEP_SECONDS, with the player's input
 *   race.snapshot();           // everything visible, as plain data
 *   race.drainEvents();        // what happened since the last drain
 *   race.fastForward();        // once the player's race is over: final results
 *   race.track;                // the road's geometry and placements
 */
export { createRace, NO_INPUT, PLAYER } from "./race";
export { STEP_SECONDS } from "./steps";
export type {
  BikeSnapshot,
  PlayerInput,
  Race,
  RaceOptions,
  RaceResults,
  RaceSnapshot,
  RiderSnapshot,
  RiderStatus,
  Standing,
} from "./race";
export type { Track, TrackSample, WorldPoint } from "./track";
export type { Temperament } from "./opponents";
export type { ObstacleKind, ObstaclePlacement, SceneryKind, SceneryPlacement } from "./placements";
export type {
  AttackKind,
  CopId,
  CrashCause,
  RaceEvent,
  RaceOutcome,
  RiderId,
  RiderOrCop,
} from "./events";
