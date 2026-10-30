import type { ComponentProps } from "react";

/** The game's menu button. */
export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`min-w-56 rounded-md border-2 border-sun/70 bg-dusk/80 px-6 py-3 font-display text-2xl uppercase tracking-wider text-sand shadow-lg transition hover:bg-sunset hover:text-night focus-visible:bg-sunset focus-visible:text-night focus-visible:outline-none ${className}`}
      {...props}
    />
  );
}
