import type { PlayerInput } from "@/race";

/** What the player throws by pressing a button: a punch (a club swing, with a club) or a kick. */
type Press = keyof Pick<PlayerInput, "punch" | "kick">;

/**
 * The punch and kick presses since the player's input was last read: each
 * counts once, in the next step, however briefly its key or button was held.
 */
export class Presses {
  private punch = false;
  private kick = false;

  /** Says the key or button for a punch or a kick was pressed. */
  press(press: Press) {
    if (press === "punch") this.punch = true;
    else this.kick = true;
  }

  /** The presses since they were last taken, which are then forgotten. */
  take(): Pick<PlayerInput, Press> {
    const taken = { punch: this.punch, kick: this.kick };
    this.clear();
    return taken;
  }

  /** Forgets the presses not yet taken, as when the window loses focus. */
  clear() {
    this.punch = false;
    this.kick = false;
  }
}
