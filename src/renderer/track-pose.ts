import type { RaceView } from "@/game/session";
import { STEP_SECONDS, type CopSnapshot, type Moving, type RaceSnapshot, type RiderSnapshot } from "@/race";

/** Where a rider or cop, or their bike, is drawn this frame in track space, between the last two snapshots. */
export interface TrackPose {
  distance: number;
  offset: number;
  /** Metres per second along the track. */
  speed: number;
  /** Metres per second sideways; positive is right. */
  sideways: number;
}

export function createTrackPose(): TrackPose {
  return { distance: 0, offset: 0, speed: 0, sideways: 0 };
}

/**
 * Fills `pose` with the interpolated pose for this frame of the rider or cop
 * whose entry `entryIn` picks out of a snapshot: where they are, on their
 * bike or off it after a crash. Reuses `pose` to spare the garbage collector.
 */
export function poseOf(
  view: RaceView,
  entryIn: (snapshot: RaceSnapshot) => RiderSnapshot | CopSnapshot,
  pose: TrackPose,
): TrackPose {
  return between(entryIn(view.previous), entryIn(view.current), view.alpha, pose);
}

/** Fills `pose` with where the bike of the rider or cop whose entry `entryIn` picks out is drawn this frame: under them, or wherever it slid to. */
export function bikePoseOf(
  view: RaceView,
  entryIn: (snapshot: RaceSnapshot) => RiderSnapshot | CopSnapshot,
  pose: TrackPose,
): TrackPose {
  return between(entryIn(view.previous).bike, entryIn(view.current).bike, view.alpha, pose);
}

function between(before: Moving, after: Moving, t: number, pose: TrackPose): TrackPose {
  pose.distance = before.distance + (after.distance - before.distance) * t;
  pose.offset = before.offset + (after.offset - before.offset) * t;
  pose.speed = before.speed + (after.speed - before.speed) * t;
  pose.sideways = (after.offset - before.offset) / STEP_SECONDS;
  return pose;
}
