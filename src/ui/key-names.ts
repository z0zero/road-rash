import { useSyncExternalStore } from "react";
import type { Key } from "@/input/bindings";

/**
 * What the keys are called on the player's own keyboard. The game reads keys
 * by their place on the keyboard (W/A/S/D are wherever they are on a US
 * one), so on AZERTY the key it reads for the throttle is labelled Z. Where
 * the browser can say what each place's key is labelled (Chromium can), the
 * screens name the keys that way; elsewhere they give the US names.
 */

/** The labels of the keys by place (`KeyboardEvent.code`), once the browser has said; null until then, or for good. */
let labels: ReadonlyMap<string, string> | null = null;
let asked = false;
const listeners = new Set<() => void>();

/** The Keyboard API's layout map, which only Chromium has, and TypeScript's DOM types don't know. */
interface KeyboardLayout {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
}

function hasKeyboardLayout(navigator: Navigator): navigator is Navigator & { readonly keyboard: KeyboardLayout } {
  const keyboard: unknown = Reflect.get(navigator, "keyboard");
  return typeof keyboard === "object" && keyboard !== null && typeof Reflect.get(keyboard, "getLayoutMap") === "function";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!asked) {
    asked = true;
    if (hasKeyboardLayout(navigator)) {
      void navigator.keyboard
        .getLayoutMap()
        .then((map) => {
          labels = map;
          for (const told of listeners) told();
        })
        .catch(() => undefined);
    }
  }
  return () => listeners.delete(listener);
}

const labelsNow = () => labels;
const noLabels = () => null;

/** What the player's keyboard calls `key`: its label there, in capitals, or else its US name. */
export function nameOn(labels: ReadonlyMap<string, string> | null, key: Key): string {
  const label = labels?.get(key.code);
  return label ? label.toUpperCase() : key.name;
}

/** The labels of the player's keyboard, by place, or null where the browser can't say (or hasn't yet). */
export function useKeyboardLabels(): ReadonlyMap<string, string> | null {
  return useSyncExternalStore(subscribe, labelsNow, noLabels);
}
