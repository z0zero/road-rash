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

/** Fills `pose` with a rider's interpolated pose for this frame; reuses it to spare the garbage collector. */
export function poseOf(view: RaceView, rider: RiderId, pose: RiderPose): RiderPose {
  const before = view.previous.riders[rider];
  const after = view.current.riders[rider];
  const t = view.alpha;
  pose.distance = before.distance + (after.distance - before.distance) * t;
  pose.offset = before.offset + (after.offset - before.offset) * t;
  pose.speed = before.speed + (after.speed - before.speed) * t;
  pose.sideways = (after.offset - before.offset) / STEP_SECONDS;
  return pose;
}
