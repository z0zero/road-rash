/**
 * The controls the player rides and fights with, and the keys for each, with
 * their names on screen. There is no remapping: the keyboard reads its keys
 * from here, and the title and Controls screens name them from here, so the
 * three can't drift apart. (Esc also goes back from the screens over the
 * game, as it does on any web page's dialogs.)
 */

/** Something the player does with the keyboard or a gamepad. */
export type Control = "throttle" | "brake" | "steer" | "punch" | "kick" | "pause";

/** Every control, as the Controls screen lists it, with what it calls it. */
export const CONTROLS: readonly { readonly control: Control; readonly label: string }[] = [
  { control: "throttle", label: "Throttle" },
  { control: "brake", label: "Brake" },
  { control: "steer", label: "Steer" },
  { control: "punch", label: "Punch, or swing a club" },
  { control: "kick", label: "Kick" },
  { control: "pause", label: "Pause" },
];

/** A key, by its place on the keyboard (`KeyboardEvent.code`), and its name on screen. */
export interface Key {
  /** By place, not by letter, so that W/A/S/D sit in the same place on any layout. */
  readonly code: string;
  /** Its name on a US keyboard; the screens show the player's own keyboard's label instead where the browser can say it. */
  readonly name: string;
}

/** Two keys that steer together, one each way. */
export interface KeyPair {
  readonly left: Key;
  readonly right: Key;
}

/** A set of keys to ride with, one for each way, and what to call them together, if not by their names. */
export interface RidingKeys {
  readonly throttle: Key;
  readonly steerLeft: Key;
  readonly brake: Key;
  readonly steerRight: Key;
  readonly together?: string;
}

/** The keys to ride with, in two sets, either of which will do: W/A/S/D, and the arrow keys. */
export const RIDING_KEYS: readonly RidingKeys[] = [
  {
    throttle: { code: "KeyW", name: "W" },
    steerLeft: { code: "KeyA", name: "A" },
    brake: { code: "KeyS", name: "S" },
    steerRight: { code: "KeyD", name: "D" },
  },
  {
    throttle: { code: "ArrowUp", name: "↑" },
    steerLeft: { code: "ArrowLeft", name: "←" },
    brake: { code: "ArrowDown", name: "↓" },
    steerRight: { code: "ArrowRight", name: "→" },
    together: "the arrow keys",
  },
];

/** The keys for each control: any one of them will do, and for steering any one pair. */
export const KEYS: { readonly [C in Control]: C extends "steer" ? readonly KeyPair[] : readonly Key[] } = {
  throttle: RIDING_KEYS.map((keys) => keys.throttle),
  brake: RIDING_KEYS.map((keys) => keys.brake),
  steer: RIDING_KEYS.map((keys) => ({ left: keys.steerLeft, right: keys.steerRight })),
  punch: [
    { code: "KeyJ", name: "J" },
    { code: "KeyZ", name: "Z" },
  ],
  kick: [
    { code: "KeyK", name: "K" },
    { code: "KeyX", name: "X" },
  ],
  pause: [
    { code: "Escape", name: "Esc" },
    { code: "KeyP", name: "P" },
  ],
};

/** The keys' codes, for matching key presses. */
export function codesOf(keys: readonly Key[]): readonly string[] {
  return keys.map((key) => key.code);
}
