import type { Difficulty, PlayerInput, RaceEvent, RaceSnapshot } from "@/race";

/**
 * A play-test bot: a script that plays the player's part in a race the play-test rides headless (README.md). Each
 * step it reads the race as a player reads the screen, from the snapshots before and after the last step, and gives
 * the input for the next one.
 */
export interface Bot {
  /** The input for the next step. */
  decide(prev: RaceSnapshot, cur: RaceSnapshot): PlayerInput;
  /** What the last step's events say happened, as a player sees it on screen. */
  hear(events: readonly RaceEvent[]): void;
  /** What it did in the race, for its log row (`bot`). */
  stats(): Readonly<Record<string, number>>;
}

/** The bots, as the command line and the logs name them: the racer, the counter-puncher and the brawler. */
export const BOT_NAMES = ["racer", "counter", "brawler"] as const;
export type BotName = (typeof BOT_NAMES)[number];

/** Every difficulty, as `@/race` has them; v1.0.0's Race module, which the bots can ride too, has no list of them. */
export const DIFFICULTIES = ["easy", "normal", "hard"] as const satisfies readonly Difficulty[];

/** A bot's own random choices, such as a punch or a kick: a xorshift generator started at `state`, giving [0, 1). */
export function randomFrom(state: number): () => number {
  let r = state;
  return () => {
    r ^= r << 13;
    r >>>= 0;
    r ^= r >>> 17;
    r ^= r << 5;
    r >>>= 0;
    return r / 4294967296;
  };
}

export const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

/** How often a bot that hits picks a kick rather than a punch. */
export const KICK_SHARE = 0.25;
