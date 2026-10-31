import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty, type RaceOptions } from "@/race";

/**
 * The page's address can ask for a race to be raced again, as a bug report's
 * does: `?seed=1234&difficulty=hard`. This module writes that address for a
 * race and reads it back.
 */

/** The query (the `?` part of an address) that asks for the race created with `raceOptions` again. */
export function raceAddress({ seed, difficulty }: Required<RaceOptions>): string {
  return `?${new URLSearchParams({ seed: String(seed), difficulty })}`;
}

/** What the page's address asks races to be run with: each null where it asks for nothing, or for something there isn't. */
export interface AskedInAddress {
  /** The seed every race is run with: a whole number below 2^32. */
  readonly seed: number | null;
  /** The difficulty races are run at, instead of the one the player chose. */
  readonly difficulty: Difficulty | null;
}

/**
 * What the page's address, `search` (its `?` part), asks races to be run with.
 * The difficulty is read whatever its case, as the screens show it in
 * capitals, and with spaces around it. A seed without a difficulty asks for
 * Normal: v1.0.0's addresses held only the seed, and its one race is Normal.
 */
export function askedInAddress(search: string): AskedInAddress {
  const asked = new URLSearchParams(search);
  const seed = seedIn(asked.get("seed"));
  const difficulty = asked.get("difficulty")?.trim().toLowerCase();
  return {
    seed,
    difficulty: isDifficulty(difficulty) ? difficulty : seed === null ? null : DEFAULT_DIFFICULTY,
  };
}

/** The seed `asked` is, or null if it isn't one. */
function seedIn(asked: string | null): number | null {
  if (asked === null || !/^\d{1,10}$/.test(asked)) return null;
  const seed = Number(asked);
  return seed < 2 ** 32 ? seed : null;
}
