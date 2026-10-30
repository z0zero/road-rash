import { Fragment } from "react";
import { KEYS, type Key } from "@/input/bindings";
import { GAMEPAD_NAMES } from "@/input/gamepad";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/** Keys, or gamepad controls, used together to do something, such as A and D for steering. */
type KeyCombo = readonly string[];

interface Binding {
  readonly action: string;
  /** The key combos that do it on the keyboard: any one of them will do. */
  readonly keyboard: readonly KeyCombo[];
  /** The combos that do it on a gamepad. */
  readonly gamepad: readonly KeyCombo[];
}

/** Each of the keys or gamepad controls on its own: any one of them will do. */
const eachAlone = (controls: readonly (Key | string)[]): KeyCombo[] =>
  controls.map((control) => [typeof control === "string" ? control : control.name]);

/** Every binding: the keys and gamepad controls the input reads (src/input). There is no remapping. */
const BINDINGS: readonly Binding[] = [
  { action: "Throttle", keyboard: eachAlone(KEYS.throttle), gamepad: eachAlone(GAMEPAD_NAMES.throttle) },
  { action: "Brake", keyboard: eachAlone(KEYS.brake), gamepad: eachAlone(GAMEPAD_NAMES.brake) },
  {
    action: "Steer",
    // A key each way, used together: A and D, or the left and right arrows.
    keyboard: KEYS.steerLeft.map((left, index) => [left.name, KEYS.steerRight[index].name]),
    gamepad: eachAlone(GAMEPAD_NAMES.steer),
  },
  { action: "Punch, or swing a club", keyboard: eachAlone(KEYS.punch), gamepad: eachAlone(GAMEPAD_NAMES.punch) },
  { action: "Kick", keyboard: eachAlone(KEYS.kick), gamepad: eachAlone(GAMEPAD_NAMES.kick) },
  { action: "Pause", keyboard: eachAlone(KEYS.pause), gamepad: eachAlone(GAMEPAD_NAMES.pause) },
];

/** Every binding on the keyboard and on a gamepad, reached from the title screen. Esc goes back. */
export function ControlsScreen({ onBack }: { onBack: () => void }) {
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
          {BINDINGS.map(({ action, keyboard, gamepad }) => (
            <tr key={action}>
              <th scope="row" className="pr-3 text-lg font-semibold text-sand">
                {action}
              </th>
              <td className="px-3">
                <Alternatives combos={keyboard} />
              </td>
              <td>
                <Alternatives combos={gamepad} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1 text-center text-sm text-sand/80">
        <p>Gamepad buttons are named as on an Xbox controller: A is the bottom one, B the right one and X the left one.</p>
        <p>In menus, the D-pad or the left stick moves between buttons and A presses them.</p>
        <p>After a crash, steer to run back to your bike, and brake to stand still.</p>
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
