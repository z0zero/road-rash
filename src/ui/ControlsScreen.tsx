import { CONTROLS, KEYS } from "@/input/bindings";
import { GAMEPAD, GAMEPAD_MENUS, type PadControl } from "@/input/gamepad";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { useKeyboardLabels } from "./key-names";
import { Alternatives, keyCombos, padCombos } from "./KeyCaps";

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
    <Dialog title="Controls" panelClassName="w-[min(42rem,94vw)] gap-6 px-6 short:gap-3 sm:px-10">
      <table className="w-full border-separate border-spacing-y-2 text-left short:border-spacing-y-1">
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
      <Button data-back autoFocus onClick={onBack}>
        Back
      </Button>
    </Dialog>
  );
}
