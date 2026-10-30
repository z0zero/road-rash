import type { RaceOutcome, RiderId, RiderOrCop } from "./events";
import type { FighterState } from "./fighting";
import type { Patience } from "./opponent-fighting";
import type { OpponentRiding } from "./opponent-riding";
import type { Temperament } from "./opponents";
import type { Moving } from "./track";

/** The player is always rider 0. */
export const PLAYER: RiderId = 0;

/** Whether a rider is still racing, or how their race ended. */
export type RiderStatus = "racing" | RaceOutcome;

/** A rider in the race: the player, or an opponent. */
export type Rider = Player | Opponent;

/** The player: the rider whose input comes from outside the race. */
export interface Player extends RiderState {
  readonly temperament: null;
  readonly riding: null;
}

/** An opponent: a rider the race itself rides. */
export interface Opponent extends RiderState {
  /** How it races and fights. */
  readonly temperament: Temperament;
  /** How it rides this race. */
  readonly riding: OpponentRiding;
}

/** What the race keeps track of for every rider, the player or an opponent, besides what it does for anyone who fights. */
interface RiderState extends FighterState {
  readonly kind: "rider";
  readonly id: RiderId;
  readonly name: string;
  status: RiderStatus;
  finishTime: number | null;
  /** 1 for the first rider over the finish line, 2 for the next, and so on. */
  finishOrder: number | null;
  /** The bike's condition. */
  condition: number;
  /** Whether an opponent is badly beaten and dropping back until it has recovered. */
  droppingBack: boolean;
  /** How long an opponent will still ride alongside the player if they ride slowly, and whether it has given up on them. */
  readonly patience: Patience;
  /** Steps since the player last hit the rider (Infinity if never). */
  stepsSinceThePlayerHitIt: number;
  /** Steps an opponent still gives the player, after its last hit landed on them, before it attacks them again. */
  breatherSteps: number;
}

/** Whether a rider is the player rather than an opponent; or whether an event names the player, rather than an opponent, a cop or no one. */
export function isPlayer(rider: Rider): rider is Player;
export function isPlayer(who: RiderOrCop | null): boolean;
export function isPlayer(who: Rider | RiderOrCop | null): boolean {
  return who !== null && who.kind === "rider" && who.id === PLAYER;
}

/** Where a rider is: on their bike, or wherever they are after being thrown off it. */
export function whereIs(rider: Rider): Moving {
  return rider.crash ? rider.crash.body : rider.motion;
}
