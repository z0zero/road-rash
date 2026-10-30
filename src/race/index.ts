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
export { createRace, NO_INPUT } from "./race";
export { isPlayer, PLAYER } from "./riders";
export { COP_FULL_STAMINA } from "./cops";
export { COP_ALERT_RANGE, FULL_CONDITION, FULL_STAMINA, QUALIFYING_POSITION, TOP_SPEED } from "./limits";
export { AHEAD as TRAFFIC_AHEAD, MOST_CARS } from "./traffic";
export { STEP_SECONDS } from "./steps";
// The renderer finds the stretch of road nearest a point of the land with the grid the track is generated with.
export { createGroundGrid, type GroundGrid } from "./ground-grid";
export type { PlayerInput, Race, RaceOptions } from "./race";
export type { AttackSnapshot, BikeSnapshot, CarSnapshot, CopSnapshot, RaceSnapshot, RiderSnapshot } from "./snapshot";
export type { RaceResults, Standing } from "./results";
export type { RiderStatus } from "./riders";
export type { Moving, Side, Track, TrackPosition, TrackSample, WorldPoint } from "./track";
export type { CarKind } from "./traffic";
export type { CrashPhase } from "./crashing";
export type { CopStatus } from "./cops";
export type { Weapon } from "./fighting";
export type { Remark } from "./remarks";
export type { Warnings } from "./surroundings";
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
