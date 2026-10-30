import { clamp } from "@/math";
import type { PlayerInput } from "@/race";
import { listenToGamepads } from "./gamepad";
import { listenToKeyboard } from "./keyboard";
import { goBackInMenu, moveThroughMenu, pressInMenu } from "./menus";

/** What the player rides and fights with. */
export type InputDevice = "keyboard" | "gamepad";

export interface PlayerControls {
  /** Reads the gamepads: call it once every animation frame, whatever the screen, so that Start pauses and resumes. */
  poll(): void;
  /** The player's input for one step, from the keyboard and the gamepads together. */
  read(): PlayerInput;
  /** What the player last rode or fought with, so the screens can name its controls: the keyboard until a gamepad is used. */
  lastUsed(): InputDevice;
  /** Stops listening. */
  dispose(): void;
}

/**
 * The player's controls: the keyboard and any gamepads, read together, so
 * the player can ride with either, or both at once. Esc, P and a gamepad's
 * Start call `onPause`. A gamepad also gets round the screens: its D-pad or
 * left stick moves between their buttons, A presses them and B goes back.
 */
export function listenToPlayer(target: Window, onPause: () => void): PlayerControls {
  const keyboard = listenToKeyboard(target, onPause);
  const gamepads = listenToGamepads(target, {
    onPause,
    onMenuMove: (direction) => moveThroughMenu(target.document, direction),
    onMenuPress: () => pressInMenu(target.document),
    onBack: () => goBackInMenu(target.document),
  });
  let lastUsed: InputDevice = "keyboard";
  return {
    poll: () => gamepads.poll(),
    read() {
      const fromKeyboard = keyboard.read();
      const fromGamepads = gamepads.read();
      // The one doing something, if only one is: with both or neither, the player is still using the one they last did.
      const keys = isDoingSomething(fromKeyboard);
      if (keys !== isDoingSomething(fromGamepads)) lastUsed = keys ? "keyboard" : "gamepad";
      return combine(fromKeyboard, fromGamepads);
    },
    lastUsed: () => lastUsed,
    dispose() {
      keyboard.dispose();
      gamepads.dispose();
    },
  };
}

/** Whether an input rides or fights at all: a pedal pressed, steering, or a punch or kick. */
function isDoingSomething({ throttle, brake, steer, punch, kick }: PlayerInput): boolean {
  return throttle > 0 || brake > 0 || steer !== 0 || punch || kick;
}

/** Two devices' input as one: the harder of the two on each pedal, their steering added up, and the presses of either. */
function combine(a: PlayerInput, b: PlayerInput): PlayerInput {
  return {
    throttle: Math.max(a.throttle, b.throttle),
    brake: Math.max(a.brake, b.brake),
    steer: clamp(a.steer + b.steer, -1, 1),
    punch: a.punch || b.punch,
    kick: a.kick || b.kick,
  };
}
