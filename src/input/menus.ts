import type { Direction } from "./gamepad";

/**
 * Getting round the game's screens without a mouse, as a gamepad does: up and
 * down move the focus from button to button, as Tab and Shift+Tab would; left
 * and right turn a slider in focus, or move a choice in focus along, such as
 * the difficulty, as their arrow keys would; pressing presses
 * the button in focus, as Enter would; and going back presses the open
 * screen's way back, as Esc would. Only the open dialog's buttons count while
 * one is open; otherwise the whole page's, as on the title screen.
 */

/**
 * What a gamepad can move the focus to on the game's screens: buttons and
 * sliders, not links, which open pages a gamepad can't get back from.
 */
const FOCUSABLE = "button:not(:disabled), input:not(:disabled)";

/** Focus that a gamepad moves shows its ring, as focus the keyboard moves does. */
const SHOW_FOCUS: FocusOptions & { focusVisible: boolean } = { focusVisible: true };

/**
 * Moves the focus to the next or previous button, coming round at the ends,
 * or turns the slider, or moves the choice, in focus. A row of choices is one
 * stop, its chosen one, as it is for Tab.
 */
export function moveThroughMenu(document: Document, direction: Direction) {
  const focused = document.activeElement;
  if (direction === "left" || direction === "right") {
    const step = direction === "right" ? 1 : -1;
    if (focused instanceof HTMLInputElement && focused.type === "range") turn(focused, step);
    if (focused instanceof HTMLInputElement && focused.type === "radio") choose(document, focused, step);
    return;
  }
  const menu = document.querySelector('[role="dialog"]') ?? document.body;
  const items = Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (item) => item.getClientRects().length > 0 && !(item instanceof HTMLInputElement && item.type === "radio" && !item.checked),
  );
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

/**
 * Presses the way back of the screen open over the game, its button marked
 * `data-back` (Back, Resume on the pause menu, or Back to title on the
 * results), as Esc would, unless it can't be pressed yet, as on the results
 * just as they come up. During a race, and on the title screen, no screen is
 * open over the game, so nothing happens.
 */
export function goBackInMenu(document: Document) {
  const back = document.querySelector('[role="dialog"] [data-back]');
  if (back instanceof HTMLButtonElement && !back.disabled && !back.closest("[inert]")) back.click();
}

/**
 * Chooses the next or previous of the choices `choice` is one of, stopping at
 * the ends, and moves the focus to it, as the arrow keys would; clicking it
 * says so, as they would, so React's onChange hears it.
 */
function choose(document: Document, choice: HTMLInputElement, step: 1 | -1) {
  const choices = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    (other) => other.name === choice.name,
  );
  const next = choices[choices.indexOf(choice) + step];
  if (!next || next.disabled) return;
  next.focus(SHOW_FOCUS);
  next.click();
}

/** Turns a slider one step, as its arrow keys would, and says so as they would, so React's onChange hears it. */
function turn(slider: HTMLInputElement, step: 1 | -1) {
  if (step > 0) slider.stepUp();
  else slider.stepDown();
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
}
