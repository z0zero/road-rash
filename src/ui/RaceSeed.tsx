import type { Difficulty } from "@/race";
import { difficultyName } from "./format";

/**
 * The race's difficulty and seed, small, for a bug report: with `?seed=` and
 * the seed, and `&difficulty=` and the difficulty, in the page's address, the
 * game races that same race again.
 */
export function RaceSeed({ seed, difficulty }: { seed: number; difficulty: Difficulty }) {
  return (
    <p
      title={`Add ?seed=${seed}&difficulty=${difficulty} to the page's address to race this race again`}
      className="text-xs uppercase tracking-widest text-sand/60"
    >
      <span data-testid="race-difficulty" className="font-semibold">
        {difficultyName(difficulty)}
      </span>{" "}
      &middot;{" "}
      <span data-testid="race-seed">
        Race seed <span className="select-all font-sans font-semibold normal-case tabular-nums">{seed}</span>
      </span>
    </p>
  );
}
