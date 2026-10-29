/**
 * Every key the game reads, by what it does, with its name on screen. There
 * is no remapping: the keyboard reads its keys from here, and the title and
 * Controls screens name them from here, so the three can't drift apart.
 */

/** Something the player does with a key. Steering takes two, one each way. */
export type KeyAction = "throttle" | "brake" | "steerLeft" | "steerRight" | "punch" | "kick" | "pause";

/** A key, by its place on the keyboard (`KeyboardEvent.code`), and its name on screen. */
export interface Key {
  /** By place, not by letter, so that W/A/S/D sit in the same place on any layout. */
  readonly code: string;
  readonly name: string;
}

/** The keys for each action: any one of them will do. */
export const KEYS: Readonly<Record<KeyAction, readonly Key[]>> = {
  throttle: [
    { code: "KeyW", name: "W" },
    { code: "ArrowUp", name: "↑" },
  ],
  brake: [
    { code: "KeyS", name: "S" },
    { code: "ArrowDown", name: "↓" },
  ],
  steerLeft: [
    { code: "KeyA", name: "A" },
    { code: "ArrowLeft", name: "←" },
  ],
  steerRight: [
    { code: "KeyD", name: "D" },
    { code: "ArrowRight", name: "→" },
  ],
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

/** The keys' names, as a sentence says them: "J or Z". */
export function namesOf(keys: readonly Key[]): string {
  return keys.map((key) => key.name).join(" or ");
}
