import type { ReactNode } from "react";
import { Button } from "./Button";
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

/**
 * Instead of the game, on a phone or tablet that can only be touched: the game
 * is played with a keyboard or a gamepad. Someone who has one connected there
 * can play anyway.
 */
export function MadeForDesktopScreen({ onPlayAnyway }: { onPlayAnyway: () => void }) {
  return (
    <UnsupportedScreen heading="Rev & Wreck is made for desktop">
      <p>
        It&apos;s played with a keyboard or a gamepad, and has no touch controls yet. Come back on a computer, or
        connect a keyboard or gamepad here.
      </p>
      <p className="text-base text-sand/80">Got a keyboard or gamepad connected?</p>
      <Button onClick={onPlayAnyway}>Play anyway</Button>
    </UnsupportedScreen>
  );
}

/** The game's title, then why the game can't be played here, over the sunset. */
function UnsupportedScreen({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex h-full overflow-y-auto bg-gradient-to-b from-night via-dusk to-sunset px-4 py-6 sm:py-8">
      <div className="m-auto flex flex-col items-center gap-5 text-center sm:gap-6">
        <GameTitle />
        <section
          aria-labelledby="unsupported-title"
          className="flex w-[min(36rem,100%)] flex-col items-center gap-4 rounded-xl border border-sun/40 bg-night/85 px-5 py-6 text-base text-sand shadow-2xl sm:px-10 sm:py-7 sm:text-lg"
        >
          <h2 id="unsupported-title" className="font-display text-3xl uppercase italic tracking-wide text-sun sm:text-4xl">
            {heading}
          </h2>
          {children}
        </section>
      </div>
    </div>
  );
}
