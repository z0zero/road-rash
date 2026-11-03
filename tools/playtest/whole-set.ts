import type { Difficulty } from "@/race";
import { DIFFICULTIES, type BotName } from "./bot";

/** A run of a bot, or of the cut-in measure, on the seeds from `first` to `last`. */
export type Job =
  | { readonly kind: "run"; readonly difficulty: Difficulty; readonly bot: BotName; readonly pace: string; readonly first: number; readonly last: number }
  | { readonly kind: "cut-ins"; readonly difficulty: Difficulty; readonly first: number; readonly last: number };

/** The bots and paces every difficulty is ridden with on seeds 1-24. */
const EVERY_DIFFICULTY: readonly (readonly [BotName, string])[] = [
  ["racer", "0.75"],
  ["racer", "0.85"],
  ["racer", "0.92"],
  ["racer", "1.0"],
  ["counter", "0.85"],
  ["counter", "0.92"],
  ["counter", "1.0"],
  ["brawler", "1.0"],
];
/** The runs ridden on seeds 25-48 as well: those of the claims that were measured over 48 seeds. */
const SEEDS_25_TO_48: readonly (readonly [Difficulty, BotName, string])[] = [
  ["easy", "racer", "0.75"],
  ["easy", "racer", "0.85"],
  ["normal", "racer", "0.92"],
  ["normal", "racer", "1.0"],
  ["hard", "racer", "0.92"],
  ["hard", "racer", "1.0"],
  ["hard", "counter", "0.92"],
  ["hard", "counter", "1.0"],
];

/**
 * The whole set behind the 1.2.0 release notes (CHANGELOG.md): the 32 runs of the play-test's measure, 768 races,
 * and the cut-in measure on every difficulty, 72 more. The notes' figures over 72 seeds, over 1,344 races and over 144
 * cut-in races also take the extra runs README.md lists.
 */
export const WHOLE_SET: readonly Job[] = [
  ...DIFFICULTIES.map((difficulty): Job => ({ kind: "cut-ins", difficulty, first: 1, last: 24 })),
  ...DIFFICULTIES.flatMap((difficulty) => EVERY_DIFFICULTY.map(([bot, pace]): Job => ({ kind: "run", difficulty, bot, pace, first: 1, last: 24 }))),
  ...SEEDS_25_TO_48.map(([difficulty, bot, pace]): Job => ({ kind: "run", difficulty, bot, pace, first: 25, last: 48 })),
];

/** A run's name, such as "Normal racer 1.0, seeds 1-24". */
export const nameOf = (job: Job) =>
  `${job.difficulty[0].toUpperCase()}${job.difficulty.slice(1)} ${job.kind === "cut-ins" ? "cut-ins" : `${job.bot} ${job.pace}`}, seeds ${job.first}-${job.last}`;
