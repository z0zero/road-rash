import type { RaceView } from "@/game/session";
import { STEP_SECONDS, type RiderId } from "@/race";

/** Where a rider is drawn this frame, between the last two snapshots. */
export interface RiderPose {
  distance: number;
  offset: number;
  /** Metres per second along the track. */
  speed: number;
  /** Metres per second sideways; positive is right. */
  sideways: number;
}

export function createPose(): RiderPose {
  return { distance: 0, offset: 0, speed: 0, sideways: 0 };
}

/**
 * Fills `pose` with a rider's interpolated pose for this frame: where the
 * rider is, on their bike or off it after a crash. Reuses `pose` to spare the
 * garbage collector.
 */
export function poseOf(view: RaceView, rider: RiderId, pose: RiderPose): RiderPose {
  return between(view.previous.riders[rider], view.current.riders[rider], view.alpha, pose);
}

/** Fills `pose` with where a rider's bike is drawn this frame: under the rider, or wherever it slid to after a crash. */
export function bikePoseOf(view: RaceView, rider: RiderId, pose: RiderPose): RiderPose {
  return between(view.previous.riders[rider].bike, view.current.riders[rider].bike, view.alpha, pose);
}

type Place = Pick<RiderPose, "distance" | "offset" | "speed">;

function between(before: Place, after: Place, t: number, pose: RiderPose): RiderPose {
  pose.distance = before.distance + (after.distance - before.distance) * t;
  pose.offset = before.offset + (after.offset - before.offset) * t;
  pose.speed = before.speed + (after.speed - before.speed) * t;
  pose.sideways = (after.offset - before.offset) / STEP_SECONDS;
  return pose;
}
