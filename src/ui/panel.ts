/**
 * The look the screens share, as Tailwind classes, so a change to it is one
 * edit: the panel each screen sits in, over the game or the sunset, its
 * title, the menus' controls, and the sunset behind the screens shown instead
 * of the game.
 */

/** A panel: dark glass with a sunlit edge. */
export const PANEL = "rounded-xl border border-sun/40 bg-night/85 shadow-2xl";

/** A panel's title; each screen sizes it. */
export const PANEL_TITLE = "font-display uppercase italic tracking-wide text-sun";

/** A menu's control: its frame, a menu button's and the difficulty's row of choices alike. */
export const MENU_CONTROL = "min-w-56 rounded-md border-2 border-sun/70 bg-dusk/80 shadow-lg";

/**
 * A menu button lit, as the one Enter or a gamepad's A would press, in focus,
 * or under the pointer: filled with the sunset...
 */
export const MENU_BUTTON_LIT =
  "hover:bg-sunset hover:text-night focus-visible:bg-sunset focus-visible:text-night focus-visible:outline-none";
/** ...and a choice in focus lit as a button is, from its radio button, the label's `peer`. */
export const MENU_CHOICE_LIT = "peer-focus-visible:bg-sunset peer-focus-visible:text-night";

/** The sunset behind the loading screen and the screens shown instead of the game. */
export const SUNSET_BACKDROP = "bg-gradient-to-b from-night via-dusk to-sunset";

/** The browsers to suggest to someone whose browser can't run the game. */
export const RECENT_BROWSERS = "the latest Chrome, Edge, Firefox or Safari";
