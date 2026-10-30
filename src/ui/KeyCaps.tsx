import { Fragment } from "react";
import type { Key, KeyPair } from "@/input/bindings";
import type { PadControl } from "@/input/gamepad";
import { nameOn } from "./key-names";

/** Keys, or gamepad controls, used together to do something, such as A and D for steering. */
export type KeyCombo = readonly string[];

/** The keys that do something, named as the player's keyboard `labels` them: one key, or a pair used together. */
export function keyCombos(keys: readonly (Key | KeyPair)[], labels: ReadonlyMap<string, string> | null): KeyCombo[] {
  return keys.map((key) => ("left" in key ? [nameOn(labels, key.left), nameOn(labels, key.right)] : [nameOn(labels, key)]));
}

/** The gamepad controls that do something, each on its own. */
export function padCombos(controls: readonly PadControl[]): KeyCombo[] {
  return controls.map((control) => [control.name]);
}

/**
 * The combos that do something, any one of which will do: each combo's keys
 * or controls side by side as key caps, `large` ones for the HUD.
 */
export function Alternatives({ combos, large = false }: { combos: readonly KeyCombo[]; large?: boolean }) {
  const size = large ? "min-w-10 text-xl" : "min-w-8 text-sm";
  return combos.map((combo, index) => (
    <Fragment key={combo.join(" ")}>
      {index > 0 && <span className="mx-2 text-sand/70">or</span>}
      <span className="inline-flex gap-1 whitespace-nowrap">
        {combo.map((key) => (
          <kbd
            key={key}
            className={`inline-block rounded-md border border-sand/60 border-b-[3px] bg-dusk/70 px-2 py-0.5 text-center font-sans font-semibold text-sand ${size}`}
          >
            {key}
          </kbd>
        ))}
      </span>
    </Fragment>
  ));
}
