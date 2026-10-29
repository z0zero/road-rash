"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { GameTitle } from "@/ui/TitleScreen";
import { NewerBrowserScreen } from "@/ui/UnsupportedScreens";
import { supportsWebGL2 } from "./browser-support";

/** The game renders only in the browser; the static page shows the title while it loads. */
const Game = dynamic(() => import("./Game"), { ssr: false, loading: () => <Loading /> });

/** Whether the browser has WebGL 2 doesn't change while the page is open. */
const subscribeToNothing = () => () => {};

/**
 * The game, in a browser that can run it. A browser without WebGL 2 is told
 * it needs a newer one instead, and never loads the game. Nothing is known
 * of the browser while the page is prerendered and hydrated, so until then
 * the loading screen shows.
 */
export function GameLoader() {
  const webGL2 = useSyncExternalStore(subscribeToNothing, supportsWebGL2, () => null);
  if (webGL2 === null) return <Loading />;
  if (!webGL2) return <NewerBrowserScreen />;
  return <Game />;
}

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-night via-dusk to-sunset">
      <GameTitle />
      <p className="text-lg text-sand/90">Loading&hellip;</p>
    </div>
  );
}
