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
}

export interface Controls {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
}

/** Advances one rider's motion by `dt` seconds under the given controls. */
export function ride(motion: Motion, controls: Controls, dt: number): void {
  const throttle = clamp(controls.throttle, 0, 1);
  const brake = clamp(controls.brake, 0, 1);
  const acceleration =
    throttle * driveAcceleration(motion.speed) -
    brake * TUNING.braking -
    (1 - throttle) * (1 - brake) * coastingDeceleration(motion.speed);
  motion.speed = clamp(motion.speed + acceleration * dt, 0, TUNING.topSpeed);

  const steeringTarget = clamp(controls.steer, -1, 1) * maxSidewaysSpeed(motion.speed);
  motion.steering += (steeringTarget - motion.steering) * Math.min(1, TUNING.steeringResponse * dt);

  motion.distance += motion.speed * dt;
  motion.offset += motion.steering * dt;
}

/** Steering moves the bike sideways at up to about 8 m/s at low speed and less at high speed. */
function maxSidewaysSpeed(speed: number) {
  const share = speed / TUNING.topSpeed;
  return Math.min(
    TUNING.steeringPerSpeed * speed,
    TUNING.maxSidewaysSpeed - TUNING.sidewaysSpeedLossAtTopSpeed * share * share,
  );
}

function driveAcceleration(speed: number) {
  const share = speed / TUNING.topSpeed;
  return Math.max(TUNING.minimumDriveAcceleration, TUNING.launchAcceleration * (1 - share * share));
}

function coastingDeceleration(speed: number) {
  return TUNING.rollingResistance + TUNING.airDrag * speed * speed;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
