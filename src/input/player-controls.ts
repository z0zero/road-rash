import { clamp } from "@/math";
import type { PlayerInput } from "@/race";
import { listenToGamepads } from "./gamepad";
import { listenToKeyboard } from "./keyboard";
import { moveThroughMenu, pressInMenu } from "./menus";

export interface PlayerControls {
  /** Reads the gamepads: call it once every animation frame, whatever the screen, so that Start pauses and resumes. */
  poll(): void;
  /** The player's input for one step, from the keyboard and the gamepads together. */
  read(): PlayerInput;
  /** Stops listening. */
  dispose(): void;
}

/**
 * The player's controls: the keyboard and any gamepads, read together, so
 * the player can ride with either, or both at once. Esc, P and a gamepad's
 * Start call `onPause`. A gamepad also gets round the screens: its D-pad or
 * left stick moves between their buttons and A presses them.
 */
export function listenToPlayer(target: Window, onPause: () => void): PlayerControls {
  const keyboard = listenToKeyboard(target, onPause);
  const gamepads = listenToGamepads(target, {
    onPause,
    onMenuMove: (direction) => moveThroughMenu(target.document, direction),
    onMenuPress: () => pressInMenu(target.document),
  });
  return {
    poll: () => gamepads.poll(),
    read: () => combine(keyboard.read(), gamepads.read()),
    dispose() {
      keyboard.dispose();
      gamepads.dispose();
    },
  };
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
