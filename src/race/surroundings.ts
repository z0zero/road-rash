import type { RiderId } from "./events";

/** Where a rider is and how fast they are going along the track. */
export interface Place {
  readonly id: RiderId;
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres right of the centreline. */
  readonly offset: number;
  /** Metres per second along the track. */
  readonly speed: number;
}

/** Riders the player should know are there, on either side of them. */
export interface Warnings {
  /** A rider is alongside the player, or coming up from behind, on their left. */
  readonly left: boolean;
  /** A rider is alongside the player, or coming up from behind, on their right. */
  readonly right: boolean;
}

/** The nearest opponent is named only if they are within this many metres of the player. */
const NEAREST_RANGE = 50;
/** A rider at most this many metres from the player along the track... */
const ALONGSIDE_ALONG = 3;
/** ...and this many across it is alongside them. */
const ALONGSIDE_ACROSS = 4;
/** A rider up to this many metres behind the player and going faster is coming up from behind. */
const COMING_UP = 30;

/** The opponent nearest the player (straight-line, in track space) if one is within range; null otherwise. */
export function nearestOpponent(player: Place, opponents: readonly Place[]): RiderId | null {
  let nearest: RiderId | null = null;
  let nearestApart = NEAREST_RANGE;
  for (const opponent of opponents) {
    const apart = Math.hypot(opponent.distance - player.distance, opponent.offset - player.offset);
    if (apart <= nearestApart) [nearest, nearestApart] = [opponent.id, apart];
  }
  return nearest;
}

/** Which sides of the player have an opponent alongside them, or coming up from behind. */
export function warningsFor(player: Place, opponents: readonly Place[]): Warnings {
  let left = false;
  let right = false;
  for (const opponent of opponents) {
    const behind = player.distance - opponent.distance;
    const alongside = Math.abs(behind) <= ALONGSIDE_ALONG && Math.abs(opponent.offset - player.offset) <= ALONGSIDE_ACROSS;
    const comingUp = behind > 0 && behind <= COMING_UP && opponent.speed > player.speed;
    if (!alongside && !comingUp) continue;
    if (opponent.offset < player.offset) left = true;
    else right = true;
  }
  return { left, right };
}
