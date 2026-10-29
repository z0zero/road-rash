import { NO_INPUT, type PlayerInput } from "@/race";

// Buttons and axes of the standard gamepad mapping (https://w3c.github.io/gamepad/#remapping),
// buttons named as on an Xbox controller: A is the bottom face button, B the right one, X the left one.
const A = 0;
const B = 1;
const X = 2;
const LEFT_TRIGGER = 6;
const RIGHT_TRIGGER = 7;
const START = 9;
const D_PAD_LEFT = 14;
const D_PAD_RIGHT = 15;
/** The left stick across: -1 is full left, 1 full right. */
const LEFT_STICK_X = 0;

/** The left stick steers only once pushed this far from the middle, so a stick that doesn't quite centre doesn't drift. */
const STICK_DEAD_ZONE = 0.15;
/** A trigger counts only once pulled this far, so one resting a touch off zero doesn't hold the throttle open. */
const TRIGGER_DEAD_ZONE = 0.05;

export interface Gamepads {
  /** Reads every gamepad: call it once per animation frame. Start's presses call `onPause` straight away. */
  poll(): void;
  /**
   * The player's input for one step, from what the gamepads held when last
   * polled and the X and B presses since the last read.
   */
  read(): PlayerInput;
  /** Stops listening. */
  dispose(): void;
}

/**
 * Turns gamepads with the standard mapping into the player's input: the
 * right trigger or A throttles, the left trigger brakes, the left stick or
 * the D-pad steers, X punches, B kicks and Start calls `onPause`. A punch or
 * kick press counts once, in the next step read. Gamepads without the
 * standard mapping are ignored: their buttons could be anywhere. While the
 * window has lost focus, the gamepads count for nothing, as if let go.
 */
export function listenToGamepads(target: Window, onPause: () => void): Gamepads {
  /** What every gamepad's buttons were doing at the last poll, by the gamepad's index. */
  const lastPressed = new Map<number, readonly boolean[]>();
  let held: Pick<PlayerInput, "throttle" | "brake" | "steer"> = NO_INPUT;
  let punched = false;
  let kicked = false;
  let focused = target.document.hasFocus();

  const loseFocus = () => {
    focused = false;
    held = NO_INPUT;
    punched = false;
    kicked = false;
  };
  const regainFocus = () => {
    focused = true;
  };
  target.addEventListener("blur", loseFocus);
  target.addEventListener("focus", regainFocus);

  return {
    poll() {
      let throttle = 0;
      let brake = 0;
      let steer = 0;
      for (const pad of standardGamepads(target.navigator)) {
        const pressed = pad.buttons.map((button) => button.pressed);
        const before = lastPressed.get(pad.index);
        lastPressed.set(pad.index, pressed);
        // Without focus, only what the buttons are doing is kept, so that one held all along isn't taken for a new press.
        if (!focused) continue;
        throttle = Math.max(throttle, triggerPull(pad, RIGHT_TRIGGER), pressed[A] ? 1 : 0);
        brake = Math.max(brake, triggerPull(pad, LEFT_TRIGGER));
        steer += steeringOf(pad, pressed);
        // A gamepad seen for the first time: the buttons it is already holding were pressed before now.
        if (!before) continue;
        const justPressed = (button: number) => pressed[button] && !before[button];
        if (justPressed(X)) punched = true;
        if (justPressed(B)) kicked = true;
        if (justPressed(START)) onPause();
      }
      held = { throttle, brake, steer: Math.max(-1, Math.min(1, steer)) };
    },
    read() {
      const input = { ...NO_INPUT, ...held, punch: punched, kick: kicked };
      punched = false;
      kicked = false;
      return input;
    },
    dispose() {
      target.removeEventListener("blur", loseFocus);
      target.removeEventListener("focus", regainFocus);
    },
  };
}

/** The connected gamepads with the standard mapping; none where the browser has no Gamepad API or won't share it. */
function standardGamepads(navigator: Navigator): Gamepad[] {
  if (typeof navigator.getGamepads !== "function") return [];
  try {
    return navigator
      .getGamepads()
      .filter((pad): pad is Gamepad => pad !== null && pad.connected && pad.mapping === "standard");
  } catch {
    // A page in a frame the gamepad permission policy shuts out: as if no gamepad were there.
    return [];
  }
}

/** How far a trigger is pulled, from 0 to 1, past its dead zone. */
function triggerPull(pad: Gamepad, trigger: number): number {
  const value = pad.buttons[trigger]?.value ?? 0;
  return value < TRIGGER_DEAD_ZONE ? 0 : (value - TRIGGER_DEAD_ZONE) / (1 - TRIGGER_DEAD_ZONE);
}

/** Steering from -1 (full left) to 1 (full right): the D-pad if it is pressed, otherwise the left stick past its dead zone. */
function steeringOf(pad: Gamepad, pressed: readonly boolean[]): number {
  const dPad = (pressed[D_PAD_RIGHT] ? 1 : 0) - (pressed[D_PAD_LEFT] ? 1 : 0);
  if (dPad !== 0) return dPad;
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const beyond = Math.abs(across) - STICK_DEAD_ZONE;
  return beyond <= 0 ? 0 : Math.sign(across) * Math.min(1, beyond / (1 - STICK_DEAD_ZONE));
}
