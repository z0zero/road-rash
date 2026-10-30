import { type ReactNode, useId } from "react";
import { codesOf, KEYS } from "@/input/bindings";
import { PANEL, PANEL_TITLE } from "./panel";

const BACK = codesOf(KEYS.back);

/**
 * A screen over the game, such as Settings or the pause menu: the game dimmed
 * behind a panel with the screen's title. With `onBack`, Esc goes back. The
 * screen's way back, which a gamepad's B presses, is its button marked
 * `data-back`.
 */
export function Dialog({
  title,
  onBack,
  panelClassName,
  children,
}: {
  title: string;
  /** What Esc does, on a screen Esc leaves. */
  onBack?: () => void;
  /** The panel's width, spacing and alignment. */
  panelClassName: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-night/60 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (BACK.includes(event.code)) onBack?.();
      }}
    >
      <div className={`flex flex-col items-center py-8 ${PANEL} ${panelClassName}`}>
        <h2 id={titleId} className={`text-5xl ${PANEL_TITLE}`}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
