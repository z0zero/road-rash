import { clamp } from "@/math";
import { NO_INPUT, type PlayerInput } from "@/race";
import type { Control } from "./bindings";
import { Presses } from "./presses";

/**
 * A gamepad's control: a button of the standard mapping
 * (https://w3c.github.io/gamepad/#remapping), or its left stick or D-pad, with
 * its name on screen. Buttons are named as on an Xbox controller: A is the
 * bottom face button, B the right one and X the left one.
 */
export type PadControl =
  | { readonly button: number; readonly name: string }
  | { readonly stick: "left"; readonly name: string }
  | { readonly dPad: true; readonly name: string };

const A = { button: 0, name: "A" } as const;
const B = { button: 1, name: "B" } as const;
const X = { button: 2, name: "X" } as const;
const LEFT_TRIGGER = { button: 6, name: "Left trigger" } as const;
const RIGHT_TRIGGER = { button: 7, name: "Right trigger" } as const;
const START = { button: 9, name: "Start" } as const;
const LEFT_STICK = { stick: "left", name: "Left stick" } as const;
const D_PAD = { dPad: true, name: "D-pad" } as const;
/** The D-pad's buttons, by the way each points. */
const D_PAD_BUTTONS: Readonly<Record<Direction, number>> = { up: 12, down: 13, left: 14, right: 15 };
/** The left stick: across, -1 is full left and 1 full right; up and down, -1 is full up and 1 full down. */
const LEFT_STICK_X = 0;
const LEFT_STICK_Y = 1;

/**
 * The gamepad's controls for each thing the player does, any one of which
 * will do: the gamepad reads them from here, and the Controls screen names
 * them from here. Throttle and brake are pulled as far as the furthest of
 * theirs is (a button is all or nothing); the others are pressed. B kicks
 * in a race and goes back on the screens over the game.
 */
export const GAMEPAD: { readonly [C in Control]: readonly PadControl[] } = {
  throttle: [RIGHT_TRIGGER, A],
  brake: [LEFT_TRIGGER],
  steer: [LEFT_STICK, D_PAD],
  punch: [X],
  kick: [B],
  pause: [START],
  back: [B],
};

/** Getting round the screens with a gamepad: what moves between their buttons, and what presses one. */
export const GAMEPAD_MENUS: { readonly move: readonly PadControl[]; readonly press: readonly PadControl[] } = {
  move: [D_PAD, LEFT_STICK],
  press: [A],
};

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

/** The two ways across each way: left and right across up and down, and the other way about. */
const ACROSS: Readonly<Record<Direction, readonly [Direction, Direction]>> = {
  up: ["left", "right"],
  down: ["left", "right"],
  left: ["up", "down"],
  right: ["up", "down"],
};

/** What a gamepad's presses do, besides the riding: pausing, and getting round the screens. */
export interface GamepadHandlers {
  /** Start was pressed. */
  onPause(): void;
  /** The D-pad was pressed, or the left stick pushed, one way: one way at most each poll. */
  onMenuMove(direction: Direction): void;
  /** A was pressed. */
  onMenuPress(): void;
  /** B was pressed. */
  onBack(): void;
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
  /** Which ways its D-pad pointed (see `pointDPad`). */
  readonly dPad: Record<Direction, boolean>;
  /** Which ways its left stick pointed. */
  readonly stick: Record<Direction, boolean>;
}

function padState(): PadState {
  return {
    pressed: [],
    dPad: { up: false, down: false, left: false, right: false },
    stick: { up: false, down: false, left: false, right: false },
  };
}

/** A gamepad doing nothing: what one seen for the first time is compared with. */
const DOING_NOTHING: Readonly<PadState> = padState();

/** No gamepads at all. */
const NONE: readonly (Gamepad | null)[] = [];

/**
 * Turns gamepads with the standard mapping into the player's input: the
 * right trigger or A throttles, the left trigger brakes, the left stick or
 * the D-pad steers, X punches and B kicks. A punch or kick press counts once,
 * in the next step read. Start, A, B and the D-pad or the left stick's pushes
 * also call their `handlers`, for pausing and for menus: one way at most each
 * poll, and none across a way held already (see `pointDPad` and
 * `pointStick`), so that a D-pad pressed, or a stick pushed, between two
 * ways, down and right say, doesn't move onto a choice and move it along,
 * whether its two ways come in one poll or a frame apart.
 * Gamepads without the standard mapping are ignored: their buttons could be
 * anywhere. While the window has lost focus, the gamepads count for nothing,
 * as if let go.
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
      /** Whether this poll has moved through a menu already. */
      let moved = false;
      for (const pad of gamepadsOf(target.navigator)) {
        if (!pad || !pad.connected || pad.mapping !== "standard") continue;
        const before = lastSeen.get(pad.index) ?? DOING_NOTHING;
        const now = spare.pop() ?? padState();
        now.pressed.length = pad.buttons.length;
        for (let button = 0; button < pad.buttons.length; button++) now.pressed[button] = pad.buttons[button].pressed;
        pointDPad(now.dPad, now.pressed, before);
        pointStick(now.stick, pad, before);
        seen.set(pad.index, now);
        // Without focus, only what the gamepad is doing is kept, so that a button held all along isn't taken for a new press.
        if (!focused) continue;
        throttle = Math.max(throttle, pullOf(pad, GAMEPAD.throttle));
        brake = Math.max(brake, pullOf(pad, GAMEPAD.brake));
        steer += steeringOf(pad, now);
        // A gamepad seen for the first time is compared with one doing nothing, so what it is holding counts as
        // just pressed: browsers show a gamepad to the page only once one of its buttons is pressed, and that press
        // should do what it says, not just wake the gamepad.
        if (anyJustPressed(GAMEPAD.punch, now, before)) presses.press("punch");
        if (anyJustPressed(GAMEPAD.kick, now, before)) presses.press("kick");
        if (anyJustPressed(GAMEPAD.pause, now, before)) handlers.onPause();
        if (anyJustPressed(GAMEPAD_MENUS.press, now, before)) handlers.onMenuPress();
        if (anyJustPressed(GAMEPAD.back, now, before)) handlers.onBack();
        for (const direction of DIRECTIONS) {
          if (moved || !isPointing(now, direction) || isPointing(before, direction)) continue;
          handlers.onMenuMove(direction);
          moved = true;
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

/** Whether any of the buttons among `controls` is down `now`, and wasn't `before`. */
function anyJustPressed(controls: readonly PadControl[], now: PadState, before: Readonly<PadState>): boolean {
  for (const control of controls) {
    if ("button" in control && now.pressed[control.button] && !before.pressed[control.button]) return true;
  }
  return false;
}

/** How far the furthest pulled of the buttons among `controls` is pulled, from 0 to 1, past their dead zone. */
function pullOf(pad: Gamepad, controls: readonly PadControl[]): number {
  let pull = 0;
  for (const control of controls) if ("button" in control) pull = Math.max(pull, triggerPull(pad, control.button));
  return pull;
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
  const dPad = (state.pressed[D_PAD_BUTTONS.right] ? 1 : 0) - (state.pressed[D_PAD_BUTTONS.left] ? 1 : 0);
  if (dPad !== 0) return dPad;
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const beyond = Math.abs(across) - STICK_DEAD_ZONE;
  return beyond <= 0 ? 0 : Math.sign(across) * Math.min(1, beyond / (1 - STICK_DEAD_ZONE));
}

/**
 * Sets which ways the D-pad points now into `dPad`, from which of its buttons
 * are `pressed`, given what it was doing `before`: the ways pressed, but not
 * one pressed while a way across it was held already, which doesn't point
 * until it is let go of and pressed again. So a D-pad pressed between down and
 * right, its right switch closing a frame after its down one, points down, as
 * the stick does pushed that way, and doesn't then move a choice along.
 */
function pointDPad(dPad: Record<Direction, boolean>, pressed: readonly boolean[], before: Readonly<PadState>) {
  for (const direction of DIRECTIONS) {
    const [one, other] = ACROSS[direction];
    const heldAcross = isDPadHeld(one, pressed, before) || isDPadHeld(other, pressed, before);
    const isPressed = Boolean(pressed[D_PAD_BUTTONS[direction]]);
    const wasPressed = Boolean(before.pressed[D_PAD_BUTTONS[direction]]);
    dPad[direction] = isPressed && (before.dPad[direction] || (!wasPressed && !heldAcross));
  }
}

/** Whether the D-pad's `direction` is `pressed` now and was at the poll `before`. */
function isDPadHeld(direction: Direction, pressed: readonly boolean[], before: Readonly<PadState>): boolean {
  return Boolean(pressed[D_PAD_BUTTONS[direction]]) && Boolean(before.pressed[D_PAD_BUTTONS[direction]]);
}

/**
 * Sets which ways the left stick points now into `stick`, given which ways it
 * pointed `before`. Pushed between two ways, it points one of them: the way
 * it pointed already, if it did, so that a stick wavering about the middle
 * doesn't point one way, then the other; otherwise the way it is pushed the
 * furthest, so down and a little right is down.
 */
function pointStick(stick: Record<Direction, boolean>, pad: Gamepad, before: Readonly<PadState>) {
  const across = pad.axes[LEFT_STICK_X] ?? 0;
  const down = pad.axes[LEFT_STICK_Y] ?? 0;
  stick.up = isPushed(-down, before.stick.up);
  stick.down = isPushed(down, before.stick.down);
  stick.left = isPushed(-across, before.stick.left);
  stick.right = isPushed(across, before.stick.right);
  if ((stick.up || stick.down) && (stick.left || stick.right)) {
    const acrossBefore = before.stick.left || before.stick.right;
    const pointsAcross = acrossBefore === (before.stick.up || before.stick.down) ? Math.abs(across) > Math.abs(down) : acrossBefore;
    if (pointsAcross) stick.up = stick.down = false;
    else stick.left = stick.right = false;
  }
}

/** Whether the stick, pushed `push` of the way one way, points that way, given whether it pointed that way before. */
function isPushed(push: number, wasPushed: boolean): boolean {
  return push >= (wasPushed ? STICK_PUSH_ENDS : STICK_PUSH_STARTS);
}

/** Whether a gamepad points `direction`, on its D-pad or with its left stick. */
function isPointing(state: Readonly<PadState>, direction: Direction): boolean {
  return state.dPad[direction] || state.stick[direction];
}
