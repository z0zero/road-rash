/**
 * Every event a race can emit, so the UI and audio can react to what happens.
 * Riders are identified by their index in `RaceSnapshot.riders` (the player is
 * rider `PLAYER`); cops by their index among the race's cops. Speeds are in
 * metres per second and times in seconds of race time.
 */

/** Identifies a rider: their index in `RaceSnapshot.riders`. */
export type RiderId = number;

/** Identifies a cop: their index among the race's cops. */
export type CopId = number;

/** Anyone who can attack or be attacked: a rider or a cop. */
export type RiderOrCop = { readonly kind: "rider"; readonly id: RiderId } | { readonly kind: "cop"; readonly id: CopId };

export type AttackKind = "punch" | "kick" | "club-swing";

/** What made a rider crash: a knock-off by a hit, or running into another rider, traffic or an obstacle. */
export type CrashCause = "knocked-off" | "rider" | "traffic" | "obstacle";

/** The three ways a rider's race ends. */
export type RaceOutcome = "finished" | "wrecked" | "busted";

export type RaceEvent =
  /** The countdown ran out and the riders may go. */
  | { readonly type: "race-started" }
  /** An attack's wind-up began; `target` is null when nobody was within reach. */
  | {
      readonly type: "attack-thrown";
      readonly attacker: RiderOrCop;
      readonly target: RiderOrCop | null;
      readonly kind: AttackKind;
    }
  | {
      readonly type: "attack-landed";
      readonly attacker: RiderOrCop;
      readonly target: RiderOrCop;
      readonly kind: AttackKind;
    }
  /** `by` took the club `from` its holder by hitting them during their wind-up. */
  | { readonly type: "weapon-stolen"; readonly from: RiderOrCop; readonly by: RiderOrCop }
  | {
      readonly type: "crash";
      readonly rider: RiderId;
      readonly cause: CrashCause;
      /** Metres per second. */
      readonly impactSpeed: number;
    }
  /** A car ran into a rider on foot and knocked them down: they tumble again. It is not a crash: their bike is none the worse. */
  | {
      readonly type: "knocked-down";
      readonly rider: RiderId;
      /** Metres per second. */
      readonly impactSpeed: number;
    }
  | { readonly type: "remounted"; readonly rider: RiderId }
  | { readonly type: "wrecked"; readonly rider: RiderId }
  | { readonly type: "busted"; readonly rider: RiderId; readonly cop: CopId }
  /** A cop came within range of the player (the cop alert and siren start). */
  | { readonly type: "cop-near"; readonly cop: CopId }
  /** A cop left the player's range (the cop alert and siren stop). */
  | { readonly type: "cop-gone"; readonly cop: CopId }
  | { readonly type: "cop-retaliating"; readonly cop: CopId; readonly target: RiderId }
  | {
      readonly type: "rider-finished";
      readonly rider: RiderId;
      /** Race time at which the rider crossed the finish line, in seconds. */
      readonly time: number;
      readonly position: number;
    }
  | { readonly type: "player-race-over"; readonly outcome: RaceOutcome };
