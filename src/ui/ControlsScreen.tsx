import { Fragment } from "react";
import { Button } from "./Button";

/** One way to do something: keys, or gamepad controls, used together, such as A and D for steering. */
type Way = readonly string[];

interface Binding {
  readonly action: string;
  /** The ways to do it on the keyboard: any one of them will do. */
  readonly keyboard: readonly Way[];
  /** The ways to do it on a gamepad. */
  readonly gamepad: readonly Way[];
}

/** Every binding: the keys and gamepad controls the input reads (src/input). There is no remapping. */
const BINDINGS: readonly Binding[] = [
  { action: "Throttle", keyboard: [["W"], ["↑"]], gamepad: [["Right trigger"], ["A"]] },
  { action: "Brake", keyboard: [["S"], ["↓"]], gamepad: [["Left trigger"]] },
  { action: "Steer", keyboard: [["A", "D"], ["←", "→"]], gamepad: [["Left stick"], ["D-pad"]] },
  { action: "Punch, or swing a club", keyboard: [["J"], ["Z"]], gamepad: [["X"]] },
  { action: "Kick", keyboard: [["K"], ["X"]], gamepad: [["B"]] },
  { action: "Pause", keyboard: [["Esc"], ["P"]], gamepad: [["Start"]] },
];

/** Every binding on the keyboard and on a gamepad, reached from the title screen. Esc goes back. */
export function ControlsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="controls-title"
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-night/60 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onBack();
      }}
    >
      <div className="flex w-[min(42rem,94vw)] flex-col items-center gap-6 rounded-xl border border-sun/40 bg-night/85 px-6 py-8 shadow-2xl sm:px-10">
        <h2 id="controls-title" className="font-display text-5xl uppercase italic tracking-wide text-sun">
          Controls
        </h2>
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
                  <Ways ways={keyboard} />
                </td>
                <td>
                  <Ways ways={gamepad} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-1 text-center text-sm text-sand/80">
          <p>Gamepad buttons are named as on an Xbox controller: A is the bottom one, B the right one and X the left one.</p>
          <p>In menus, the D-pad or the left stick moves between buttons and A presses them.</p>
        </div>
        <Button autoFocus onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

/** The ways to do something, any one of which will do: each way's keys or controls side by side. */
function Ways({ ways }: { ways: readonly Way[] }) {
  return ways.map((way, index) => (
    <Fragment key={way.join(" ")}>
      {index > 0 && <span className="mx-2 text-sand/70">or</span>}
      <span className="inline-flex gap-1 whitespace-nowrap">
        {way.map((key) => (
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
