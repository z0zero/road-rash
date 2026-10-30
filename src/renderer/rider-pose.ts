import type { RaceView } from "@/game/session";
import { STEP_SECONDS, type RaceSnapshot, type RiderSnapshot } from "@/race";

/** Someone on the road as a snapshot shows them, a rider or a cop: where they are, on their bike or off it, and their bike. */
export type OnTheRoad = Pick<RiderSnapshot, "distance" | "offset" | "speed" | "bike">;

/** Where a rider or cop is drawn this frame, between the last two snapshots. */
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
 * Fills `pose` with the interpolated pose for this frame of the rider or cop
 * that `whom` picks out of a snapshot: where they are, on their bike or off
 * it after a crash. Reuses `pose` to spare the garbage collector.
 */
export function poseOf(view: RaceView, whom: (snapshot: RaceSnapshot) => OnTheRoad, pose: RiderPose): RiderPose {
  return between(whom(view.previous), whom(view.current), view.alpha, pose);
}

/** Fills `pose` with where the bike of the rider or cop `whom` picks out is drawn this frame: under them, or wherever it slid to. */
export function bikePoseOf(view: RaceView, whom: (snapshot: RaceSnapshot) => OnTheRoad, pose: RiderPose): RiderPose {
  return between(whom(view.previous).bike, whom(view.current).bike, view.alpha, pose);
}

type TrackPosition = Pick<RiderPose, "distance" | "offset" | "speed">;

function between(before: TrackPosition, after: TrackPosition, t: number, pose: RiderPose): RiderPose {
  pose.distance = before.distance + (after.distance - before.distance) * t;
  pose.offset = before.offset + (after.offset - before.offset) * t;
  pose.speed = before.speed + (after.speed - before.speed) * t;
  pose.sideways = (after.offset - before.offset) / STEP_SECONDS;
  return pose;
}
