import { type ReactNode, useEffect, useId } from "react";
import { isBackPress } from "@/input/keyboard";
import { goBackInMenu } from "@/input/menus";
import { PANEL, PANEL_TITLE } from "./panel";

/**
 * A screen over the game, such as Settings or the pause menu: the game dimmed
 * behind a panel with the screen's title. Its way back is its button marked
 * `data-back`, which Esc presses (see `useBackKey`), as a gamepad's B does.
 */
export function Dialog({
  title,
  escGoesBack = true,
  panelClassName,
  children,
}: {
  title: string;
  /** Whether Esc presses the way back: not on the pause menu, where Esc is a pause key, which resumes the race itself. */
  escGoesBack?: boolean;
  /** The panel's width, spacing and alignment, tighter in a short window. */
  panelClassName: string;
  children: ReactNode;
}) {
  const titleId = useId();
  useBackKey(escGoesBack);
  return (
    // The panel is centred by its margins, which give way where the window is too short for it: then it starts at the
    // top and scrolls, rather than overflowing both ways, its title out of reach. In a narrow window, it is only as wide
    // as the overlay's padding leaves room for, rather than running past the window's right edge.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-0 flex flex-col overflow-y-auto bg-night/60 p-4 backdrop-blur-sm"
    >
      <div className={`m-auto flex max-w-full flex-col items-center py-8 short:py-4 ${PANEL} ${panelClassName}`}>
        <h2 id={titleId} className={`text-5xl short:text-4xl ${PANEL_TITLE}`}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/**
 * While the screen over the game that calls it is up, a press of Back's key
 * (Esc) presses the screen's way back, its button marked `data-back`, as a
 * gamepad's B does (`goBackInMenu`): wherever the focus is, and not while that
 * button can't be pressed yet, as on the results just as they come up. The
 * key's repeats while it is held don't count (`isBackPress`).
 */
export function useBackKey(on = true) {
  useEffect(() => {
    if (!on) return;
    const goBack = (event: KeyboardEvent) => {
      if (isBackPress(event)) goBackInMenu(document);
    };
    window.addEventListener("keydown", goBack);
    return () => window.removeEventListener("keydown", goBack);
  }, [on]);
}
