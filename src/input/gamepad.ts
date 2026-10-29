import { NO_INPUT, type PlayerInput } from "@/race";

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

/** The left stick steers only once pushed this far from the middle, so a stick that doesn't quite centre doesn't drift. */
const STICK_DEAD_ZONE = 0.15;
/** A trigger counts only once pulled this far, so one resting a touch off zero doesn't hold the throttle open. */
const TRIGGER_DEAD_ZONE = 0.05;
/** A stick pushed this far one way points that way, for getting round menus... */
const STICK_POINTS = 0.6;
/** ...until it comes back within this, so that a stick wavering at the edge doesn't point again and again. */
const STICK_STOPS_POINTING = 0.4;

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

/** What a gamepad was doing when last polled. */
interface PadState {
  /** Which of its buttons were pressed, by button. */
  readonly pressed: readonly boolean[];
  /** Which ways its left stick pointed. */
  readonly stick: Readonly<Record<Direction, boolean>>;
}

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
  /** What every gamepad was doing at the last poll, by the gamepad's index. */
  const lastSeen = new Map<number, PadState>();
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
        const before = lastSeen.get(pad.index);
        const now: PadState = { pressed: pad.buttons.map((button) => button.pressed), stick: stickPointing(pad, before) };
        lastSeen.set(pad.index, now);
        // Without focus, only what the gamepad is doing is kept, so that a button held all along isn't taken for a new press.
        if (!focused) continue;
        throttle = Math.max(throttle, triggerPull(pad, RIGHT_TRIGGER), now.pressed[A] ? 1 : 0);
        brake = Math.max(brake, triggerPull(pad, LEFT_TRIGGER));
        steer += steeringOf(pad, now);
        // A gamepad seen for the first time: whatever it is already holding was pressed before now.
        if (!before) continue;
        const justPressed = (button: number) => now.pressed[button] && !before.pressed[button];
        if (justPressed(X)) punched = true;
        if (justPressed(B)) kicked = true;
        if (justPressed(START)) handlers.onPause();
        if (justPressed(A)) handlers.onMenuPress();
        for (const direction of DIRECTIONS) {
          if (points(now, direction) && !points(before, direction)) handlers.onMenuMove(direction);
        }
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
function steeringOf(pad: Gamepad, state: PadState): number {
  const dPad = (state.pressed[D_PAD.right] ? 1 : 0) - (state.pressed[D_PAD.left] ? 1 : 0);
  if (dPad !== 0) return dPad;
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const beyond = Math.abs(across) - STICK_DEAD_ZONE;
  return beyond <= 0 ? 0 : Math.sign(across) * Math.min(1, beyond / (1 - STICK_DEAD_ZONE));
}

/** Which ways the left stick points now, given which ways it pointed `before`. */
function stickPointing(pad: Gamepad, before: PadState | undefined): Record<Direction, boolean> {
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const down = pad.axes[LEFT_STICK_Y] ?? 0;
  const pointing = (push: number, direction: Direction) =>
    push >= (before?.stick[direction] ? STICK_STOPS_POINTING : STICK_POINTS);
  return {
    up: pointing(-down, "up"),
    down: pointing(down, "down"),
    left: pointing(-across, "left"),
    right: pointing(across, "right"),
  };
}

/** Whether a gamepad points `direction`, on its D-pad or with its left stick. */
function points(state: PadState, direction: Direction): boolean {
  return Boolean(state.pressed[D_PAD[direction]]) || state.stick[direction];
}
