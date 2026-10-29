"use client";

import dynamic from "next/dynamic";
import { GameTitle } from "@/ui/TitleScreen";

/** The game renders only in the browser; the static page shows the title while it loads. */
const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-night via-dusk to-sunset">
      <GameTitle />
      <p className="text-lg text-sand/90">Loading&hellip;</p>
    </div>
  ),
});

export function GameLoader() {
  return <Game />;
}
