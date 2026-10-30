import { Fragment } from "react";
import { CONTROLS, KEYS, type Key, type KeyPair } from "@/input/bindings";
import { GAMEPAD, GAMEPAD_MENUS, type PadControl } from "@/input/gamepad";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { nameOn, useKeyboardLabels } from "./key-names";

/** Keys, or gamepad controls, used together to do something, such as A and D for steering. */
type KeyCombo = readonly string[];

/** The keys that do something, named as the player's keyboard `labels` them: one key, or a pair used together. */
function keyCombos(keys: readonly (Key | KeyPair)[], labels: ReadonlyMap<string, string> | null): KeyCombo[] {
  return keys.map((key) => ("left" in key ? [nameOn(labels, key.left), nameOn(labels, key.right)] : [nameOn(labels, key)]));
}

/** The gamepad controls that do something, each on its own. */
function padCombos(controls: readonly PadControl[]): KeyCombo[] {
  return controls.map((control) => [control.name]);
}

/** Controls, as a sentence names them: "the D-pad or the left stick", "A". */
function sayOr(controls: readonly PadControl[]): string {
  // A one-letter name is a button's own (A); the others are parts of the gamepad, in lower case
  // unless named by a letter (the D-pad).
  const say = (name: string) => (/^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name);
  return controls.map(({ name }) => (name.length === 1 ? name : `the ${say(name)}`)).join(" or ");
}

/** Every binding on the keyboard and on a gamepad, reached from the title screen. Esc goes back. */
export function ControlsScreen({ onBack }: { onBack: () => void }) {
  const labels = useKeyboardLabels();
  return (
    <Dialog title="Controls" onBack={onBack} panelClassName="w-[min(42rem,94vw)] gap-6 px-6 sm:px-10">
      <table className="w-full border-separate border-spacing-y-2 text-left">
        <thead>
          <tr className="font-display text-xl uppercase tracking-wider text-sunset">
            <th scope="col" className="font-normal">
              <span className="sr-only">Action</span>
            </th>
            <th scope="col" className="px-3 font-normal">
              Keyboard
            </th>
            <th scope="col" className="font-normal">
              Gamepad
            </th>
          </tr>
        </thead>
        <tbody>
          {CONTROLS.map(({ control, label }) => (
            <tr key={control}>
              <th scope="row" className="pr-3 text-lg font-semibold text-sand">
                {label}
              </th>
              <td className="px-3">
                <Alternatives combos={keyCombos(KEYS[control], labels)} />
              </td>
              <td>
                <Alternatives combos={padCombos(GAMEPAD[control])} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1 text-center text-sm text-sand/80">
        <p>Gamepad buttons are named as on an Xbox controller: A is the bottom one, B the right one and X the left one.</p>
        <p>
          In menus, {sayOr(GAMEPAD_MENUS.move)} moves between buttons and {sayOr(GAMEPAD_MENUS.press)} presses them.
        </p>
        <p>After a crash, steer to run back to your bike, and brake to stand still.</p>
        {labels === null && <p>The letter keys are where they are on a US keyboard, whatever yours are labelled.</p>}
      </div>
      <Button autoFocus onClick={onBack}>
        Back
      </Button>
    </Dialog>
  );
}

/** The combos that do something, any one of which will do: each combo's keys or controls side by side. */
function Alternatives({ combos }: { combos: readonly KeyCombo[] }) {
  return combos.map((combo, index) => (
    <Fragment key={combo.join(" ")}>
      {index > 0 && <span className="mx-2 text-sand/70">or</span>}
      <span className="inline-flex gap-1 whitespace-nowrap">
        {combo.map((key) => (
          <kbd
            key={key}
            className="inline-block min-w-8 rounded-md border border-sand/60 border-b-[3px] bg-dusk/70 px-2 py-0.5 text-center font-sans text-sm font-semibold text-sand"
          >
            {key}
          </kbd>
        ))}
      </span>
    </Fragment>
  ));
}
