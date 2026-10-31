import { raceAddress } from "@/game/race-address";
import type { RaceOptions } from "@/race";
import { difficultyName } from "./format";

/**
 * What a race can be raced again from: its difficulty and seed, small, for a
 * bug report. The page's address can ask for the same race again with them
 * (`raceAddress`), as the hint under the pointer says.
 */
export function RaceReplay({ raceOptions }: { raceOptions: Required<RaceOptions> }) {
  const { seed, difficulty } = raceOptions;
  return (
    <p
      title={`Add ${raceAddress(raceOptions)} to the page's address to race this race again`}
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
