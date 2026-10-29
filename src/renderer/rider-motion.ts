import type { RaceView } from "@/game/session";
import type { RiderId } from "@/race";
import { createPose, poseOf, type RiderPose } from "./rider-pose";

const GRAVITY = 9.81;
/** Radians. */
const MAX_LEAN = 0.75;
/** How quickly the drawn lean follows the wanted lean (1/s), whatever the frame rate. */
const LEAN_RESPONSE = 9;

/**
 * How one rider is drawn this frame: where they are, which way they face, how
 * far they lean into the corner and how far their wheels have turned. The
 * renderer keeps one per rider and updates it once a frame, before anything
 * that draws or follows that rider reads it.
 */
export class RiderMotion {
  readonly pose: RiderPose = createPose();
  /** Metres, on the road's surface. */
  x = 0;
  y = 0;
  z = 0;
  /** Radians about the vertical, as three.js turns an object: facing along the road, turned towards its sideways motion. */
  yaw = 0;
  /** Radians the road climbs ahead. */
  pitch = 0;
  /** Radians the road is banked; positive tilts it down to the right. */
  bank = 0;
  /** Radians the bike leans into the corner, positive to the right, smoothed. */
  lean = 0;
  /** Radians the wheels have turned. */
  wheelTurn = 0;
  /** Whether the bike is beyond the road's edge, on the shoulder. */
  offRoad = false;

  constructor(readonly rider: RiderId) {}

  /** Moves on to this frame's view, `delta` seconds after the last. */
  update(view: RaceView, delta: number, wheelRadius: number) {
    const { distance, offset, speed, sideways } = poseOf(view, this.rider, this.pose);
    const road = view.track.sampleAt(distance);
    const at = view.track.pointAt(distance, offset);
    this.x = at.x;
    this.y = at.y;
    this.z = at.z;
    // Face along the road, turned a little towards the sideways motion.
    this.yaw = -road.heading - Math.atan2(sideways, Math.max(speed, 1));
    this.pitch = Math.atan(road.grade);
    this.bank = road.bank;
    // Lean as a motorcycle does: into the sideways acceleration of the bend and of steering.
    const turning = speed * speed * road.curvature + (speed * sideways) / 60;
    const wanted = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, 0.7 * Math.atan(turning / GRAVITY)));
    this.lean += (wanted - this.lean) * (1 - Math.exp(-LEAN_RESPONSE * delta));
    this.wheelTurn = (this.wheelTurn + (speed * delta) / wheelRadius) % (Math.PI * 2);
    this.offRoad = Math.abs(offset) > view.track.roadHalfWidth;
  }
}
