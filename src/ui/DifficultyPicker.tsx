import { useId } from "react";
import type { Press } from "@/input/menus";
import { DIFFICULTIES, type Difficulty } from "@/race";
import { difficultyName } from "./format";
import { MENU_CHOICE_LIT, MENU_CONTROL } from "./panel";

/**
 * The difficulty the player's races are run at, as three choices in a row,
 * the chosen one marked: a click chooses one, and once the choice has the
 * focus the arrow keys, or a gamepad's D-pad, move it along, stopping at the
 * ends, or up and down off the row; Enter, Space or a gamepad's A starts the
 * race.
 */
export function DifficultyPicker({
  difficulty,
  onChoose,
  onStart,
}: {
  difficulty: Difficulty;
  onChoose: (difficulty: Difficulty) => void;
  /** Starts the race, at the difficulty chosen. */
  onStart: (press: Press) => void;
}) {
  const group = useId();
  return (
    <fieldset className={`flex gap-1 p-1 ${MENU_CONTROL}`}>
      <legend className="sr-only">Difficulty</legend>
      {DIFFICULTIES.map((choice) => (
        <label key={choice} className="flex-1">
          <input
            type="radio"
            name={group}
            value={choice}
            checked={choice === difficulty}
            onChange={() => onChoose(choice)}
            // The arrow keys move the choice along the row, and up and down off it, as on every menu (`listenToKeyboard`).
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onStart(event);
              }
            }}
            className="peer sr-only"
          />
          {/* The chosen one dark, its name in the sun's colour, underlined; lit only while the row has the focus. */}
          <span
            className={`block cursor-pointer rounded px-3 py-1 text-center font-display text-lg uppercase tracking-wider text-sand/75 decoration-2 underline-offset-4 transition hover:text-sand peer-checked:bg-night/80 peer-checked:text-sun peer-checked:underline ${MENU_CHOICE_LIT}`}
          >
            {difficultyName(choice)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
