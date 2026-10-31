import type { ComponentProps } from "react";
import { MENU_BUTTON_LIT, MENU_CONTROL } from "./panel";

/** The game's menu button. */
export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`${MENU_CONTROL} px-6 py-3 font-display text-2xl uppercase tracking-wider text-sand transition ${MENU_BUTTON_LIT} ${className}`}
      {...props}
    />
  );
}
