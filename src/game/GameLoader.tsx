"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { GameTitle } from "@/ui/TitleScreen";
import { MadeForDesktopScreen, NewerBrowserScreen } from "@/ui/UnsupportedScreens";
import { isTouchOnly, subscribeToPointers, supportsWebGL2 } from "./browser-support";

/** The game renders only in the browser; the static page shows the title while it loads. */
const Game = dynamic(() => import("./Game"), { ssr: false, loading: () => <Loading /> });

/** Whether the browser has WebGL 2 doesn't change while the page is open. */
const subscribeToNothing = () => () => {};

/**
 * The game, where it can be played. A phone or tablet that can only be touched
 * is told the game is made for desktop, though someone with a keyboard or
 * gamepad connected there can play anyway; a browser without WebGL 2 is told
 * it needs a newer one. Either way the game isn't loaded. Nothing is known of
 * the browser while the page is prerendered and hydrated, so until then the
 * loading screen shows.
 */
export function GameLoader() {
  const touchOnly = useSyncExternalStore(subscribeToPointers, isTouchOnly, () => null);
  const webGL2 = useSyncExternalStore(subscribeToNothing, supportsWebGL2, () => null);
  const [playAnyway, setPlayAnyway] = useState(false);
  if (touchOnly === null || webGL2 === null) return <Loading hintIfStuck />;
  if (touchOnly && !playAnyway) return <MadeForDesktopScreen onPlayAnyway={() => setPlayAnyway(true)} />;
  if (!webGL2) return <NewerBrowserScreen />;
  return <Game />;
}

/**
 * The title while the game loads. On the prerendered page it can also hint,
 * after a few seconds, at what the game needs: a browser that can't run the
 * game's scripts never gets past it.
 */
function Loading({ hintIfStuck = false }: { hintIfStuck?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-night via-dusk to-sunset px-6 text-center">
      <GameTitle />
      <p className="text-lg text-sand/90">Loading&hellip;</p>
      {hintIfStuck && (
        <p className="still-loading max-w-md text-sand/85">
          Still loading? Rev &amp; Wreck needs a recent browser with JavaScript and WebGL 2, such as the latest
          Chrome, Edge, Firefox or Safari.
        </p>
      )}
    </div>
  );
}
