import type { Crash } from "./crashing";
import type { RaceOutcome, RiderId } from "./events";
import type { Attack, Weapon } from "./fighting";
import type { Patience } from "./opponent-fighting";
import type { OpponentRiding } from "./opponent-riding";
import type { Temperament } from "./opponents";
import type { Motion } from "./riding";

/** The player is always rider 0. */
export const PLAYER: RiderId = 0;

/** Whether a rider is still racing, or how their race ended. */
export type RiderStatus = "racing" | RaceOutcome;

/** A rider in the race: the player, or an opponent. */
export interface Rider {
  readonly kind: "rider";
  readonly id: RiderId;
  readonly name: string;
  readonly temperament: Temperament | null;
  /** The bike's motion, which is the rider's too while they ride it. */
  readonly motion: Motion;
  /** How an opponent rides; null for the player, whose input comes from outside. */
  readonly riding: OpponentRiding | null;
  status: RiderStatus;
  finishTime: number | null;
  /** 1 for the first rider over the finish line, 2 for the next, and so on. */
  finishOrder: number | null;
  stamina: number;
  /** The bike's condition. */
  condition: number;
  /** Steps since the rider was last hit (Infinity if never). */
  stepsSinceHit: number;
  /** The attack the rider is making, or null. */
  attack: Attack | null;
  /** The weapon the rider holds, or null. */
  weapon: Weapon | null;
  /** Null while the rider is on their bike; how they are getting back to it after a crash. */
  crash: Crash | null;
  /** Whether an opponent is badly beaten and dropping back until it has recovered. */
  droppingBack: boolean;
  /** How long an opponent will still ride alongside the player if they ride slowly, and whether it has given up on them. */
  readonly patience: Patience;
  /** Steps since the player last hit the rider (Infinity if never). */
  stepsSinceThePlayerHitIt: number;
  /** Steps an opponent still gives the player, after its last hit landed on them, before it attacks them again. */
  breatherSteps: number;
}

/** Where a rider is: on their bike, or wherever they are after being thrown off it. */
export function whereIs(rider: Rider): { readonly distance: number; readonly offset: number; readonly speed: number } {
  return rider.crash ? rider.crash.body : rider.motion;
}
