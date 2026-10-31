/**
 * How hard the opponents make a race: Easy for a first race, Normal, tuned as
 * v1.0.0 was, and Hard for players who have qualified on Normal. A
 * difficulty changes only how the opponents ride and fight; the track, the
 * traffic and the cops are the same on every one.
 */
export type Difficulty = "easy" | "normal" | "hard";

/** Every difficulty, the easiest first. */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

/** The difficulty a race is run at unless another is chosen. */
export const DEFAULT_DIFFICULTY: Difficulty = "normal";

/** How catch-up holds the field near the player (see `catchUpFor`). */
export interface CatchUp {
  /** Opponents within this many metres of the player, along the track, ride at their usual pace... */
  readonly near: number;
  /** ...and catch-up grows with the distance beyond it, to its most at this many metres... */
  readonly far: number;
  /** ...where opponents behind the player ride this share faster than their pace, and those ahead this share slower. */
  readonly most: number;
}

/** How the opponents ride and fight on a difficulty. */
export interface DifficultyTuning {
  /** Every opponent's pace, as a share of its pace on Normal: how close to the limit it rides. */
  readonly pace: number;
  /** How often opponents attack the player when they are within reach and free to, as a share of how often on Normal. */
  readonly attacks: number;
  /** The breather (seconds) an opponent gives a player who isn't fighting it back, after each of its hits lands on them. */
  readonly breatherSeconds: number;
  /**
   * How far a brawler's or bully's patience goes with a player who doesn't
   * hit back: once this many of its hits in a row have landed on them while
   * they weren't fighting it back, it gives up on them.
   */
  readonly unansweredHits: number;
  readonly catchUp: CatchUp;
}

/**
 * Each difficulty's tuning. Normal's numbers are v1.0.0's. Easy's and Hard's
 * were tuned with the play-tests' bots over 24 seeds: on Easy a novice
 * (riding at 75% of a safe pace) finishes mid-field and is seldom alone, and
 * an average rider (85%) usually qualifies; on Hard an expert qualifies now
 * and then.
 */
export const DIFFICULTY_TUNING: Readonly<Record<Difficulty, DifficultyTuning>> = {
  easy: {
    pace: 0.89,
    attacks: 0.5,
    breatherSeconds: 5,
    unansweredHits: 2,
    catchUp: { near: 25, far: 150, most: 0.08 },
  },
  normal: {
    pace: 1,
    attacks: 1,
    breatherSeconds: 3,
    unansweredHits: 3,
    catchUp: { near: 75, far: 400, most: 0.08 },
  },
  hard: {
    pace: 1.07,
    attacks: 2,
    breatherSeconds: 1,
    unansweredHits: 4,
    catchUp: { near: 75, far: 400, most: 0.08 },
  },
};
