import { getCoastalTrack } from "./coastal-track";
import type { RaceEvent, RiderId } from "./events";
import { ride, type Motion } from "./riding";
import type { Track } from "./track";

/** The race advances in fixed steps of exactly this many seconds (60 Hz). */
export const STEP_SECONDS = 1 / 60;

/** The player is always rider 0. */
export const PLAYER: RiderId = 0;

const COUNTDOWN_STEPS = 180;

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
  /** Every rider, indexed by `RiderId`. */
  readonly riders: readonly RiderSnapshot[];
}

export interface RaceOptions {
  /** Seeds every random choice the race makes, so the same seed and inputs replay the same race. */
  readonly seed: number;
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
}

export function createRace(options: RaceOptions): Race {
  void options;
  let stepsTaken = 0;
  let events: RaceEvent[] = [];
  const track = getCoastalTrack();
  const player: Motion = { distance: track.startDistance, offset: 0, speed: 0, steering: 0 };

  return {
    track,
    step(input) {
      if (stepsTaken >= COUNTDOWN_STEPS) ride(player, input, STEP_SECONDS);
      stepsTaken++;
      if (stepsTaken === COUNTDOWN_STEPS) events.push({ type: "race-started" });
    },
    snapshot() {
      return {
        countdown: Math.max(0, COUNTDOWN_STEPS - stepsTaken) / 60,
        riders: [{ id: PLAYER, distance: player.distance, offset: player.offset, speed: player.speed }],
      };
    },
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
  };
}
