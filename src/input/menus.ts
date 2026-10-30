import type { Direction } from "./gamepad";

/**
 * Getting round the game's screens without a mouse, as a gamepad does: up and
 * down move the focus from button to button, as Tab and Shift+Tab would; left
 * and right turn a slider in focus, as its arrow keys would; and pressing
 * presses the button in focus, as Enter would. Only the open dialog's buttons
 * count while one is open; otherwise the whole page's, as on the title screen.
 */

/**
 * What a gamepad can move the focus to on the game's screens: buttons and
 * sliders, not links, which open pages a gamepad can't get back from.
 */
const FOCUSABLE = "button:not(:disabled), input:not(:disabled)";

/** Focus that a gamepad moves shows its ring, as focus the keyboard moves does. */
const SHOW_FOCUS: FocusOptions & { focusVisible: boolean } = { focusVisible: true };

/** Moves the focus to the next or previous button, coming round at the ends, or turns the slider in focus. */
export function moveThroughMenu(document: Document, direction: Direction) {
  const focused = document.activeElement;
  if (direction === "left" || direction === "right") {
    if (focused instanceof HTMLInputElement && focused.type === "range") turn(focused, direction === "right" ? 1 : -1);
    return;
  }
  const menu = document.querySelector('[role="dialog"]') ?? document.body;
  const items = Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.getClientRects().length > 0);
  if (items.length === 0) return;
  const step = direction === "down" ? 1 : -1;
  const at = items.findIndex((item) => item === focused);
  const next = at === -1 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
  items[next].focus(SHOW_FOCUS);
}

/** Presses the button in focus, if any: during a race nothing is in focus, so nothing happens. */
export function pressInMenu(document: Document) {
  const focused = document.activeElement;
  if (focused instanceof HTMLButtonElement) focused.click();
}

/** Turns a slider one step, as its arrow keys would, and says so as they would, so React's onChange hears it. */
function turn(slider: HTMLInputElement, step: 1 | -1) {
  if (step > 0) slider.stepUp();
  else slider.stepDown();
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
}
