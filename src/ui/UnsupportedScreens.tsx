import { type ReactNode, useEffect, useId } from "react";
import { PANEL, PANEL_TITLE, RECENT_BROWSERS, SUNSET_BACKDROP } from "./panel";
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
        Open it in {RECENT_BROWSERS}. If that&apos;s what you&apos;re using, check that hardware acceleration is
        switched on in the browser&apos;s settings.
      </p>
    </UnsupportedScreen>
  );
}

/**
 * Instead of the game, on a phone or tablet that can only be touched: the game
 * is played with a keyboard or a gamepad. Someone who has one connected there
 * plays anyway by pressing any key or gamepad button, which shows they can: a
 * touch can't, so nobody is let into a race they can't ride, pause or leave.
 */
export function MadeForDesktopScreen({ onPlayAnyway }: { onPlayAnyway: () => void }) {
  useEffect(() => {
    let frame = 0;
    // In once a key is let go of, so the key does nothing more on the title screen.
    const keyUp = () => onPlayAnyway();
    // A gamepad shows itself to the page with its first button press: in once every button is let go of again.
    const untilLetGo = () => {
      if (gamepadButtonHeld()) frame = requestAnimationFrame(untilLetGo);
      else onPlayAnyway();
    };
    const gamepadConnected = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(untilLetGo);
    };
    window.addEventListener("keyup", keyUp);
    window.addEventListener("gamepadconnected", gamepadConnected);
    return () => {
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("gamepadconnected", gamepadConnected);
      cancelAnimationFrame(frame);
    };
  }, [onPlayAnyway]);
  return (
    <UnsupportedScreen heading="Rev & Wreck is made for desktop">
      <p>
        It&apos;s played with a keyboard or a gamepad, and has no touch controls yet. Come back on a computer, or
        connect a keyboard or gamepad here.
      </p>
      <p className="text-base text-sand/80">Got a keyboard or gamepad connected? Press any key or button to play.</p>
    </UnsupportedScreen>
  );
}

/** Whether any button of any gamepad the page can see is held down. */
function gamepadButtonHeld(): boolean {
  try {
    return navigator.getGamepads().some((pad) => pad?.buttons.some((button) => button.pressed) ?? false);
  } catch {
    return false;
  }
}

/** The game's title, then why the game can't be played here, over the sunset. */
function UnsupportedScreen({ heading, children }: { heading: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <div className={`flex h-full overflow-y-auto px-4 py-6 sm:py-8 ${SUNSET_BACKDROP}`}>
      <div className="m-auto flex flex-col items-center gap-5 text-center sm:gap-6">
        <GameTitle />
        <section
          aria-labelledby={headingId}
          className={`flex w-[min(36rem,100%)] flex-col items-center gap-4 px-5 py-6 text-base text-sand sm:px-10 sm:py-7 sm:text-lg ${PANEL}`}
        >
          <h2 id={headingId} className={`text-3xl sm:text-4xl ${PANEL_TITLE}`}>
            {heading}
          </h2>
          {children}
        </section>
      </div>
    </div>
  );
}
