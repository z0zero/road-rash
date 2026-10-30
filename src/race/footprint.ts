import type { ObstaclePlacement } from "./placements";
import { BIKE_LENGTH, BIKE_WIDTH } from "./riding";
import { velocityOf, type Car } from "./traffic";

/**
 * Where a car or an obstacle is on the road, how much of it it covers, how
 * fast it moves along it and, for a car changing lanes, the lane it is moving
 * over to: what riders steer around, and crash into. Opponents see a cop's
 * bike this way too.
 */
export interface Footprint {
  /** Metres along the centreline: its middle. */
  readonly distance: number;
  /** Metres right of the centreline: its middle. */
  readonly offset: number;
  /** Metres right of the centreline that its middle is moving over to: the middle of the lane a car is changing to, else its offset. */
  readonly movingTo: number;
  /** Metres per second along the track: negative for an oncoming car, 0 for an obstacle. */
  readonly velocity: number;
  /** Metres from its middle to its front and back... */
  readonly halfLength: number;
  /** ...and to its sides. */
  readonly halfWidth: number;
}

export function footprintOfCar(car: Car): Footprint {
  return {
    distance: car.distance,
    offset: car.offset,
    movingTo: car.lane,
    velocity: velocityOf(car),
    halfLength: car.length / 2,
    halfWidth: car.width / 2,
  };
}

/** An obstacle covers a square as wide as its round base. */
export function footprintOfObstacle({ distance, offset, radius }: ObstaclePlacement): Footprint {
  return { distance, offset, movingTo: offset, velocity: 0, halfLength: radius, halfWidth: radius };
}

/** A cop's bike, as the opponents see it: they slow down for it in time and ride round it, as round a car. */
export function footprintOfACopsBike({ distance, offset, speed }: { readonly distance: number; readonly offset: number; readonly speed: number }): Footprint {
  return { distance, offset, movingTo: offset, velocity: speed, halfLength: BIKE_LENGTH / 2, halfWidth: BIKE_WIDTH / 2 };
}
