/**
 * What the game needs of the browser and the device, checked before the game
 * loads: WebGL 2 to draw with, and something better than a touch screen to
 * play with. These touch browser APIs, so call them only in the browser,
 * never while the page is prerendered.
 */

/** Whether the browser can draw with WebGL 2, once checked. */
let webGL2: boolean | undefined;

/** Whether the browser has WebGL 2, and has it turned on. Checked the first time, then remembered. */
export function supportsWebGL2(): boolean {
  if (webGL2 === undefined) {
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      webGL2 = context !== null;
      // Let go of the trial context straight away: browsers allow only a few at once.
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webGL2 = false;
    }
  }
  return webGL2;
}

/** Media queries for whether any pointing device is coarse (a finger) or fine (a mouse, trackpad or stylus). */
const COARSE_POINTER = "(any-pointer: coarse)";
const FINE_POINTER = "(any-pointer: fine)";

/**
 * Whether the device can only be touched: a phone or tablet with no mouse or
 * trackpad, which almost always means no keyboard either.
 */
export function isTouchOnly(): boolean {
  return window.matchMedia(COARSE_POINTER).matches && !window.matchMedia(FINE_POINTER).matches;
}

/** Calls `onChange` when a pointing device comes or goes, such as a trackpad attached to a tablet; returns the unsubscribe. */
export function subscribeToPointers(onChange: () => void): () => void {
  const queries = [window.matchMedia(COARSE_POINTER), window.matchMedia(FINE_POINTER)];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}
