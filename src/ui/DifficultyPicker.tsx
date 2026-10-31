import { useId } from "react";
import { DIFFICULTIES, type Difficulty } from "@/race";
import { difficultyName } from "./format";

/**
 * The difficulty the player's races are run at, as three choices in a row,
 * the chosen one lit: a click chooses one, and once the choice has the focus
 * the arrow keys, or a gamepad's D-pad, move it along.
 */
export function DifficultyPicker({
  difficulty,
  onChoose,
}: {
  difficulty: Difficulty;
  onChoose: (difficulty: Difficulty) => void;
}) {
  const group = useId();
  return (
    <fieldset className="flex min-w-56 gap-1 rounded-md border-2 border-sun/70 bg-dusk/80 p-1 shadow-lg">
      <legend className="sr-only">Difficulty</legend>
      {DIFFICULTIES.map((choice) => (
        <label key={choice} className="flex-1">
          <input
            type="radio"
            name={group}
            value={choice}
            checked={choice === difficulty}
            onChange={() => onChoose(choice)}
            className="peer sr-only"
          />
          <span className="block cursor-pointer rounded px-3 py-1 text-center font-display text-lg uppercase tracking-wider text-sand/75 transition hover:text-sand peer-checked:bg-sunset peer-checked:text-night peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sun">
            {difficultyName(choice)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
