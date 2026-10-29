import type { RiderId } from "@/race";

/** How a rider's bike and leathers are painted. */
export interface RiderColours {
  /** The frame and fairing. */
  readonly bike: string;
  /** The tank and seat. */
  readonly trim: string;
  readonly jacket: string;
  readonly helmet: string;
}

/** By rider id: the player, then the fourteen opponents, so each rider wears the same colours in every race. */
const PALETTE: readonly RiderColours[] = [
  { bike: "#d6332a", trim: "#f2c14e", jacket: "#2f7fc1", helmet: "#f4f1ea" },
  { bike: "#1f1f24", trim: "#ff6a1a", jacket: "#3b3b44", helmet: "#ff6a1a" },
  { bike: "#2e6b5e", trim: "#c9b38a", jacket: "#5a4632", helmet: "#2e6b5e" },
  { bike: "#ff8c42", trim: "#ffd166", jacket: "#9b2d5f", helmet: "#ffd166" },
  { bike: "#1d4e89", trim: "#7fc8f8", jacket: "#16324f", helmet: "#7fc8f8" },
  { bike: "#6a994e", trim: "#f2e8cf", jacket: "#386641", helmet: "#f2e8cf" },
  { bike: "#c9184a", trim: "#ffccd5", jacket: "#590d22", helmet: "#ff4d6d" },
  { bike: "#8d3b2b", trim: "#d9a066", jacket: "#4a2c21", helmet: "#3d3d3d" },
  { bike: "#e9c46a", trim: "#2a9d8f", jacket: "#264653", helmet: "#e9c46a" },
  { bike: "#ffba08", trim: "#d00000", jacket: "#6a040f", helmet: "#d00000" },
  { bike: "#48cae4", trim: "#023e8a", jacket: "#0077b6", helmet: "#caf0f8" },
  { bike: "#6c757d", trim: "#adb5bd", jacket: "#212529", helmet: "#adb5bd" },
  { bike: "#7b2cbf", trim: "#e0aaff", jacket: "#3c096c", helmet: "#e0aaff" },
  { bike: "#b5e48c", trim: "#1a759f", jacket: "#184e77", helmet: "#b5e48c" },
  { bike: "#a68a64", trim: "#ede0d4", jacket: "#7f5539", helmet: "#582f0e" },
];

export function riderColours(rider: RiderId): RiderColours {
  return PALETTE[rider % PALETTE.length];
}
