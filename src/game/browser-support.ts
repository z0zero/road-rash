/**
 * What the game needs of the browser, checked before the game loads: WebGL 2
 * to draw with. These touch browser APIs, so call them only in the browser,
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
