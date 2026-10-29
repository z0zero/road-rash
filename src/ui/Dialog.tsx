import { type ReactNode, useId } from "react";

/**
 * A screen over the game, such as Settings or the pause menu: the game dimmed
 * behind a panel with the screen's title. With `onBack`, Esc goes back.
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
        if (event.key === "Escape") onBack?.();
      }}
    >
      <div
        className={`flex flex-col items-center rounded-xl border border-sun/40 bg-night/85 py-8 shadow-2xl ${panelClassName}`}
      >
        <h2 id={titleId} className="font-display text-5xl uppercase italic tracking-wide text-sun">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
