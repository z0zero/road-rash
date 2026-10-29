import type { ReactNode } from "react";
import { GameTitle } from "./TitleScreen";

/** Instead of the game, for a browser without WebGL 2: the game can't draw its world there. */
export function NewerBrowserScreen() {
  return (
    <UnsupportedScreen heading="Rev & Wreck needs a newer browser">
      <p>
        The game draws its coastal road in 3D with WebGL&nbsp;2, which this browser doesn&apos;t have, or has turned
        off.
      </p>
      <p>
        Open it in the latest Chrome, Edge, Firefox or Safari. If that&apos;s what you&apos;re using, check that
        hardware acceleration is switched on in the browser&apos;s settings.
      </p>
    </UnsupportedScreen>
  );
}

/** The game's title, then why the game can't be played here, over the sunset. */
function UnsupportedScreen({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex h-full overflow-y-auto bg-gradient-to-b from-night via-dusk to-sunset px-4 py-8">
      <div className="m-auto flex flex-col items-center gap-6 text-center">
        <GameTitle />
        <section
          aria-labelledby="unsupported-title"
          className="flex w-[min(36rem,100%)] flex-col items-center gap-4 rounded-xl border border-sun/40 bg-night/85 px-6 py-7 text-lg text-sand shadow-2xl sm:px-10"
        >
          <h2 id="unsupported-title" className="font-display text-4xl uppercase italic tracking-wide text-sun">
            {heading}
          </h2>
          {children}
        </section>
      </div>
    </div>
  );
}
