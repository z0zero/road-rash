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

/**
 * Every binding on the keyboard and on a gamepad, reached from the title screen. Esc goes back.
 *
 * The tallest of the screens a `Dialog` shows. It is wide enough for each row, and each note but the first, to stay on
 * one line, even in a wide font such as Linux's DejaVu Sans. In a short window, its gaps, rows and Back are tighter, and
 * its padding and title too, as every screen's are (see `Dialog`). In a cramped one, its padding and table are smaller,
 * for the table to fit in it even with a larger font, as at 480 px wide with a 20 px font.
 */
export function ControlsScreen({ onBack }: { onBack: () => void }) {
  const labels = useKeyboardLabels();
  return (
    <Dialog title="Controls" panelClassName="w-[min(52rem,94vw)] gap-6 px-6 sm:px-10 short:gap-1.5 cramped:px-4">
      <table className="w-full border-separate border-spacing-y-2 text-left short:border-spacing-y-1 cramped:[&_kbd]:text-xs">
        <thead>
          <tr className="font-display text-xl uppercase tracking-wider text-sunset cramped:text-base">
            <th scope="col" className="font-normal">
              <span className="sr-only">Action</span>
            </th>
            <th scope="col" className="px-3 font-normal cramped:px-2">
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
              <th scope="row" className="pr-3 text-lg font-semibold text-sand cramped:pr-2 cramped:text-base">
                {label}
              </th>
              <td className="px-3 cramped:px-2">
                <Alternatives combos={keyCombos(KEYS[control], labels)} />
              </td>
              <td>
                <Alternatives combos={padCombos(GAMEPAD[control])} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1 text-center text-sm text-balance text-sand/80 short:gap-0.5">
        <p>Gamepad buttons are named as on an Xbox controller: A is the bottom one, B the right one and X the left one.</p>
        <p>
          In menus, the arrow keys, {sayOr(GAMEPAD_MENUS.move)} move between buttons, and {sayOr(GAMEPAD_MENUS.press)}{" "}
          presses them.
        </p>
        <p>After a crash, steer to run back to your bike, and brake to stand still.</p>
        {labels === null && <p>The letter keys are where they are on a US keyboard, whatever yours are labelled.</p>}
      </div>
      <Button data-back autoFocus onClick={onBack} className="short:py-2">
        Back
      </Button>
    </Dialog>
  );
}
