/**
 * The look the screens share, as Tailwind classes, so a change to it is one
 * edit: the panel each screen sits in, over the game or the sunset, its
 * title, and the sunset behind the screens shown instead of the game.
 */

/** A panel: dark glass with a sunlit edge. */
export const PANEL = "rounded-xl border border-sun/40 bg-night/85 shadow-2xl";

/** A panel's title; each screen sizes it. */
export const PANEL_TITLE = "font-display uppercase italic tracking-wide text-sun";

/** The sunset behind the loading screen and the screens shown instead of the game. */
export const SUNSET_BACKDROP = "bg-gradient-to-b from-night via-dusk to-sunset";

/** The browsers to suggest to someone whose browser can't run the game. */
export const RECENT_BROWSERS = "the latest Chrome, Edge, Firefox or Safari";
