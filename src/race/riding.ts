import type { Track } from "./track";
import { TUNING } from "./tuning";

/** A rider's motion in track space. */
export interface Motion {
  /** Metres along the track's centreline. */
  distance: number;
  /** Metres sideways from the centreline; positive is right. */
  offset: number;
  /** Metres per second along the track. */
  speed: number;
  /** Metres per second sideways that steering currently adds; positive is right. */
  steering: number;
  /** Metres per second sideways from being bumped (positive is right); it dies away by itself. */
  shove: number;
}

export interface Controls {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
}

/** Advances one rider's motion along the track by `dt` seconds under the given controls. */
export function ride(motion: Motion, controls: Controls, track: Track, dt: number): void {
  const throttle = clamp(controls.throttle, 0, 1);
  const brake = clamp(controls.brake, 0, 1);
  let acceleration =
    throttle * driveAcceleration(motion.speed) -
    brake * TUNING.braking -
    (1 - throttle) * (1 - brake) * coastingDeceleration(motion.speed);

  const offRoad = Math.abs(motion.offset) > track.roadHalfWidth;
  if (offRoad && motion.speed > TUNING.offRoadTopSpeed) {
    acceleration = Math.min(acceleration, 0) - TUNING.offRoadDeceleration;
  }
  let topSpeed: number = TUNING.topSpeed;
  if (offRoad) topSpeed = Math.max(TUNING.offRoadTopSpeed, Math.min(topSpeed, motion.speed));
  motion.speed = clamp(motion.speed + acceleration * dt, 0, topSpeed);

  const steeringTarget = clamp(controls.steer, -1, 1) * maxSidewaysSpeed(motion.speed);
  motion.steering += (steeringTarget - motion.steering) * Math.min(1, TUNING.steeringResponse * dt);

  // Curves push the bike outwards in proportion to speed squared times curvature.
  const curvature = track.sampleAt(motion.distance + (motion.speed * dt) / 2).curvature;
  const push = -TUNING.curvePush * motion.speed * motion.speed * curvature;

  motion.distance += motion.speed * dt;
  const edge = track.roadHalfWidth + track.shoulderWidth;
  motion.offset = clamp(motion.offset + (motion.steering + push + motion.shove) * dt, -edge, edge);
  motion.shove *= Math.exp(-TUNING.shoveDecay * dt);
}

function driveAcceleration(speed: number) {
  const share = speed / TUNING.topSpeed;
  return Math.max(TUNING.minimumDriveAcceleration, TUNING.launchAcceleration * (1 - share * share));
}

function coastingDeceleration(speed: number) {
  return TUNING.rollingResistance + TUNING.airDrag * speed * speed;
}

/** Steering moves the bike sideways at up to about 8 m/s at low speed and less at high speed. */
export function maxSidewaysSpeed(speed: number) {
  const share = speed / TUNING.topSpeed;
  return Math.min(
    TUNING.steeringPerSpeed * speed,
    TUNING.maxSidewaysSpeed - TUNING.sidewaysSpeedLossAtTopSpeed * share * share,
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
