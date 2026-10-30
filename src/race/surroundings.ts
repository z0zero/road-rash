import type { RiderId, RiderOrCop } from "./events";

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

/** Riders and cops the player should know are there, on either side of them. */
export interface Warnings {
  /** A rider or cop is alongside the player, or coming up from behind, on their left. */
  readonly left: boolean;
  /** A rider or cop is alongside the player, or coming up from behind, on their right. */
  readonly right: boolean;
}

/** An opponent on their bike or a cop in the race, and where they are. */
export interface Someone {
  readonly who: RiderOrCop;
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres right of the centreline. */
  readonly offset: number;
}

/** The nearest opponent or cop is named only if they are within this many metres of the player. */
const NEAREST_RANGE = 50;
/** A rider at most this many metres from the player along the track... */
const ALONGSIDE_ALONG = 3;
/** ...and this many across it is alongside them. */
const ALONGSIDE_ACROSS = 4;
/** A rider up to this many metres behind the player and going faster is coming up from behind. */
const COMING_UP = 30;

/** The opponent or cop nearest the player (straight-line, in track space) if one is within range; null otherwise. */
export function nearestOpponentOrCop(player: Place, others: readonly Someone[]): RiderOrCop | null {
  let nearest: RiderOrCop | null = null;
  let nearestApart = NEAREST_RANGE;
  for (const other of others) {
    const apart = Math.hypot(other.distance - player.distance, other.offset - player.offset);
    if (apart <= nearestApart) [nearest, nearestApart] = [other.who, apart];
  }
  return nearest;
}

/** Which sides of the player have an opponent or a cop (`others`) alongside them, or coming up from behind. */
export function warningsFor(player: Place, others: readonly Omit<Place, "id">[]): Warnings {
  let left = false;
  let right = false;
  for (const other of others) {
    const behind = player.distance - other.distance;
    const alongside = Math.abs(behind) <= ALONGSIDE_ALONG && Math.abs(other.offset - player.offset) <= ALONGSIDE_ACROSS;
    const comingUp = behind > 0 && behind <= COMING_UP && other.speed > player.speed;
    if (!alongside && !comingUp) continue;
    if (other.offset < player.offset) left = true;
    else right = true;
  }
  return { left, right };
}
