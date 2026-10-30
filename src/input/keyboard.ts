import { NO_INPUT, type PlayerInput } from "@/race";
import { codesOf, KEYS } from "./bindings";

const THROTTLE = codesOf(KEYS.throttle);
const BRAKE = codesOf(KEYS.brake);
const LEFT = codesOf(KEYS.steerLeft);
const RIGHT = codesOf(KEYS.steerRight);
const PUNCH = codesOf(KEYS.punch);
const KICK = codesOf(KEYS.kick);
const PAUSE = codesOf(KEYS.pause);
const RIDING = new Set([...THROTTLE, ...BRAKE, ...LEFT, ...RIGHT]);

export interface Keyboard {
  /** The player's input for one step, from the keys held now and the attack keys pressed since the last read. */
  read(): PlayerInput;
  /** Stops listening. */
  dispose(): void;
}

/**
 * Turns the keyboard into the player's input: W or Up throttles, S or Down
 * brakes, A/D or Left/Right steer, J or Z punches, K or X kicks, and Esc or P
 * calls `onPause`. A punch or kick press counts once, in the next step read,
 * however briefly the key was held. Losing window focus releases every held
 * key.
 */
export function listenToKeyboard(target: Window, onPause: () => void): Keyboard {
  const held = new Set<string>();
  const isHeld = (codes: readonly string[]) => codes.some((code) => held.has(code));
  let punched = false;
  let kicked = false;

  const keyDown = (event: KeyboardEvent) => {
    // Sliders and other form controls keep their own keys, such as the arrows.
    if (event.target instanceof HTMLInputElement) return;
    // Browser shortcuts stay the browser's: Ctrl+P prints, Cmd+D bookmarks.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (PAUSE.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) onPause();
    } else if (PUNCH.includes(event.code) || KICK.includes(event.code)) {
      event.preventDefault();
      if (event.repeat) return;
      if (PUNCH.includes(event.code)) punched = true;
      else kicked = true;
    } else if (RIDING.has(event.code)) {
      event.preventDefault();
      held.add(event.code);
    }
  };
  const keyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
    // On a Mac, a key let go of while Cmd is down never says so, so letting go of Cmd lets go of every key.
    if (event.key === "Meta") held.clear();
  };
  const releaseAll = () => {
    held.clear();
    punched = false;
    kicked = false;
  };

  target.addEventListener("keydown", keyDown);
  target.addEventListener("keyup", keyUp);
  target.addEventListener("blur", releaseAll);

  return {
    read() {
      const input = {
        ...NO_INPUT,
        throttle: isHeld(THROTTLE) ? 1 : 0,
        brake: isHeld(BRAKE) ? 1 : 0,
        steer: (isHeld(RIGHT) ? 1 : 0) - (isHeld(LEFT) ? 1 : 0),
        punch: punched,
        kick: kicked,
      };
      punched = false;
      kicked = false;
      return input;
    },
    dispose() {
      target.removeEventListener("keydown", keyDown);
      target.removeEventListener("keyup", keyUp);
      target.removeEventListener("blur", releaseAll);
    },
  };
}
