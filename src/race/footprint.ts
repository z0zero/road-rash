import type { ObstaclePlacement } from "./placements";
import { velocityOf, type Car } from "./traffic";

/**
 * Where a car or an obstacle is on the road, how much of it it covers and how
 * fast it moves along it: what riders steer around, and crash into.
 */
export interface Footprint {
  /** Metres along the centreline: its middle. */
  readonly distance: number;
  /** Metres right of the centreline: its middle. */
  readonly offset: number;
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
    velocity: velocityOf(car),
    halfLength: car.length / 2,
    halfWidth: car.width / 2,
  };
}

/** An obstacle covers a square as wide as its round base. */
export function footprintOfObstacle({ distance, offset, radius }: ObstaclePlacement): Footprint {
  return { distance, offset, velocity: 0, halfLength: radius, halfWidth: radius };
}
