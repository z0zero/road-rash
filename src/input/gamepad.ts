import { clamp } from "@/math";
import { NO_INPUT, type PlayerInput } from "@/race";
import { Presses } from "./presses";

// Buttons and axes of the standard gamepad mapping (https://w3c.github.io/gamepad/#remapping),
// buttons named as on an Xbox controller: A is the bottom face button, B the right one, X the left one.
const A = 0;
const B = 1;
const X = 2;
const LEFT_TRIGGER = 6;
const RIGHT_TRIGGER = 7;
const START = 9;
const D_PAD: Readonly<Record<Direction, number>> = { up: 12, down: 13, left: 14, right: 15 };
/** The left stick: across, -1 is full left and 1 full right; up and down, -1 is full up and 1 full down. */
const LEFT_STICK_X = 0;
const LEFT_STICK_Y = 1;

/** How the screens name the controls above for each thing they do. */
export const GAMEPAD_NAMES = {
  throttle: ["Right trigger", "A"],
  brake: ["Left trigger"],
  steer: ["Left stick", "D-pad"],
  punch: ["X"],
  kick: ["B"],
  pause: ["Start"],
} as const satisfies Record<string, readonly string[]>;

/** The left stick steers only once pushed this far from the middle, so a stick that doesn't quite centre doesn't drift. */
const STICK_DEAD_ZONE = 0.15;
/** A trigger counts only once pulled this far, so one resting a touch off zero doesn't hold the throttle open. */
const TRIGGER_DEAD_ZONE = 0.05;
/** A push of the stick this far one way starts pointing that way, for getting round menus... */
const STICK_PUSH_STARTS = 0.6;
/** ...and ends only once it comes back within this, so that a stick wavering at the edge doesn't point again and again. */
const STICK_PUSH_ENDS = 0.4;

/** A way the D-pad or the left stick points. */
export type Direction = "up" | "down" | "left" | "right";

const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

/** What a gamepad's presses do, besides the riding: pausing, and getting round the screens. */
export interface GamepadHandlers {
  /** Start was pressed. */
  onPause(): void;
  /** The D-pad was pressed, or the left stick pushed, one way. */
  onMenuMove(direction: Direction): void;
  /** A was pressed. */
  onMenuPress(): void;
}

export interface Gamepads {
  /** Reads every gamepad: call it once per animation frame. Presses call their handlers straight away. */
  poll(): void;
  /**
   * The player's input for one step, from what the gamepads held when last
   * polled and the X and B presses since the last read.
   */
  read(): PlayerInput;
  /** Stops listening. */
  dispose(): void;
}

/** What a gamepad was doing when polled. Each poll writes over one it has done with, so polling allocates nothing. */
interface PadState {
  /** Which of its buttons were pressed, by button. */
  readonly pressed: boolean[];
  /** Which ways its left stick pointed. */
  readonly stick: Record<Direction, boolean>;
}

function padState(): PadState {
  return { pressed: [], stick: { up: false, down: false, left: false, right: false } };
}

/** A gamepad doing nothing: what one seen for the first time is compared with. */
const DOING_NOTHING: Readonly<PadState> = padState();

/** No gamepads at all. */
const NONE: readonly (Gamepad | null)[] = [];

/**
 * Turns gamepads with the standard mapping into the player's input: the
 * right trigger or A throttles, the left trigger brakes, the left stick or
 * the D-pad steers, X punches and B kicks. A punch or kick press counts once,
 * in the next step read. Start, A and the D-pad or the left stick's pushes
 * also call their `handlers`, for pausing and for menus. Gamepads without
 * the standard mapping are ignored: their buttons could be anywhere. While
 * the window has lost focus, the gamepads count for nothing, as if let go.
 */
export function listenToGamepads(target: Window, handlers: GamepadHandlers): Gamepads {
  /** What every gamepad was doing at the last poll, by the gamepad's index; one missing then is new. */
  let lastSeen = new Map<number, PadState>();
  /** Where this poll puts what every gamepad is doing; it becomes `lastSeen` once the poll is done. */
  let seen = new Map<number, PadState>();
  /** States the last poll has done with, for the next to write over. */
  const spare: PadState[] = [];
  const doneWith = (state: PadState) => spare.push(state);
  /** The pedals and steering the gamepads held at the last poll. */
  const held = { throttle: 0, brake: 0, steer: 0 };
  const presses = new Presses();
  let focused = target.document.hasFocus();

  const loseFocus = () => {
    focused = false;
    held.throttle = 0;
    held.brake = 0;
    held.steer = 0;
    presses.clear();
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
      for (const pad of gamepadsOf(target.navigator)) {
        if (!pad || !pad.connected || pad.mapping !== "standard") continue;
        const before = lastSeen.get(pad.index) ?? DOING_NOTHING;
        const now = spare.pop() ?? padState();
        now.pressed.length = pad.buttons.length;
        for (let button = 0; button < pad.buttons.length; button++) now.pressed[button] = pad.buttons[button].pressed;
        pointStick(now.stick, pad, before);
        seen.set(pad.index, now);
        // Without focus, only what the gamepad is doing is kept, so that a button held all along isn't taken for a new press.
        if (!focused) continue;
        throttle = Math.max(throttle, triggerPull(pad, RIGHT_TRIGGER), now.pressed[A] ? 1 : 0);
        brake = Math.max(brake, triggerPull(pad, LEFT_TRIGGER));
        steer += steeringOf(pad, now);
        // A gamepad seen for the first time is compared with one doing nothing, so what it is holding counts as
        // just pressed: browsers show a gamepad to the page only once one of its buttons is pressed, and that press
        // should do what it says, not just wake the gamepad.
        if (justPressed(X, now, before)) presses.press("punch");
        if (justPressed(B, now, before)) presses.press("kick");
        if (justPressed(START, now, before)) handlers.onPause();
        if (justPressed(A, now, before)) handlers.onMenuPress();
        for (const direction of DIRECTIONS) {
          if (isPointing(now, direction) && !isPointing(before, direction)) handlers.onMenuMove(direction);
        }
      }
      // What the last poll saw is done with: this poll's is the last seen now.
      lastSeen.forEach(doneWith);
      lastSeen.clear();
      const done = lastSeen;
      lastSeen = seen;
      seen = done;
      held.throttle = throttle;
      held.brake = brake;
      held.steer = clamp(steer, -1, 1);
    },
    read() {
      return { ...NO_INPUT, ...held, ...presses.take() };
    },
    dispose() {
      target.removeEventListener("blur", loseFocus);
      target.removeEventListener("focus", regainFocus);
    },
  };
}

/** Whether `button` is down `now`, and wasn't `before`. */
function justPressed(button: number, now: PadState, before: Readonly<PadState>): boolean {
  return now.pressed[button] && !before.pressed[button];
}

/**
 * The browser's gamepads, as it lists them (with gaps); none where it has no
 * Gamepad API, or won't share it, as in a frame the gamepad permission policy
 * shuts out.
 */
function gamepadsOf(navigator: Navigator): readonly (Gamepad | null)[] {
  if (typeof navigator.getGamepads !== "function") return NONE;
  try {
    return navigator.getGamepads();
  } catch {
    return NONE;
  }
}

/** How far a trigger is pulled, from 0 to 1, past its dead zone. */
function triggerPull(pad: Gamepad, trigger: number): number {
  const value = pad.buttons[trigger]?.value ?? 0;
  return value < TRIGGER_DEAD_ZONE ? 0 : (value - TRIGGER_DEAD_ZONE) / (1 - TRIGGER_DEAD_ZONE);
}

/** Steering from -1 (full left) to 1 (full right): the D-pad if it is pressed, otherwise the left stick past its dead zone. */
function steeringOf(pad: Gamepad, state: PadState): number {
  const dPad = (state.pressed[D_PAD.right] ? 1 : 0) - (state.pressed[D_PAD.left] ? 1 : 0);
  if (dPad !== 0) return dPad;
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const beyond = Math.abs(across) - STICK_DEAD_ZONE;
  return beyond <= 0 ? 0 : Math.sign(across) * Math.min(1, beyond / (1 - STICK_DEAD_ZONE));
}

/** Sets which ways the left stick points now into `stick`, given which ways it pointed `before`. */
function pointStick(stick: Record<Direction, boolean>, pad: Gamepad, before: Readonly<PadState>) {
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const down = pad.axes[LEFT_STICK_Y] ?? 0;
  stick.up = isPushed(-down, before.stick.up);
  stick.down = isPushed(down, before.stick.down);
  stick.left = isPushed(-across, before.stick.left);
  stick.right = isPushed(across, before.stick.right);
}

/** Whether the stick, pushed `push` of the way one way, points that way, given whether it pointed that way before. */
function isPushed(push: number, wasPushed: boolean): boolean {
  return push >= (wasPushed ? STICK_PUSH_ENDS : STICK_PUSH_STARTS);
}

/** Whether a gamepad points `direction`, on its D-pad or with its left stick. */
function isPointing(state: Readonly<PadState>, direction: Direction): boolean {
  return Boolean(state.pressed[D_PAD[direction]]) || state.stick[direction];
}
