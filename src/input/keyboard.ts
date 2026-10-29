import { NO_INPUT, type PlayerInput } from "@/race";

// Physical key positions (KeyboardEvent.code), so W/A/S/D sit in the same place on any layout.
const THROTTLE = ["KeyW", "ArrowUp"];
const BRAKE = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const PAUSE = ["Escape", "KeyP"];
const RIDING = new Set([...THROTTLE, ...BRAKE, ...LEFT, ...RIGHT]);

export interface Keyboard {
  /** The player's input for one step, from the keys held now. */
  read(): PlayerInput;
  /** Stops listening. */
  dispose(): void;
}

/**
 * Turns the keyboard into the player's input: W or Up throttles, S or Down
 * brakes, A/D or Left/Right steer, and Esc or P calls `onPause`. Losing window
 * focus releases every held key.
 */
export function listenToKeyboard(target: Window, onPause: () => void): Keyboard {
  const held = new Set<string>();
  const isHeld = (codes: readonly string[]) => codes.some((code) => held.has(code));

  const keyDown = (event: KeyboardEvent) => {
    // Sliders and other form controls keep their own keys, such as the arrows.
    if (event.target instanceof HTMLInputElement) return;
    if (PAUSE.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) onPause();
    } else if (RIDING.has(event.code)) {
      event.preventDefault();
      held.add(event.code);
    }
  };
  const keyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  const releaseAll = () => held.clear();

  target.addEventListener("keydown", keyDown);
  target.addEventListener("keyup", keyUp);
  target.addEventListener("blur", releaseAll);

  return {
    read() {
      return {
        ...NO_INPUT,
        throttle: isHeld(THROTTLE) ? 1 : 0,
        brake: isHeld(BRAKE) ? 1 : 0,
        steer: (isHeld(RIGHT) ? 1 : 0) - (isHeld(LEFT) ? 1 : 0),
      };
    },
    dispose() {
      target.removeEventListener("keydown", keyDown);
      target.removeEventListener("keyup", keyUp);
      target.removeEventListener("blur", releaseAll);
    },
  };
}
