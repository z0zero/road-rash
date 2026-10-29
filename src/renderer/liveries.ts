import type { RiderId } from "@/race";

/** A rider's colours: their bike's bodywork, its stripes and wheel rims, their jacket and their helmet. */
export interface Livery {
  readonly paint: string;
  readonly accent: string;
  readonly jacket: string;
  readonly helmet: string;
}

/** By rider id: the player, then the fourteen opponents, so each rider wears the same livery in every race. */
const LIVERIES: readonly Livery[] = [
  { paint: "#d6332a", accent: "#f2c14e", jacket: "#2f7fc1", helmet: "#f4f1ea" },
  { paint: "#1f1f24", accent: "#ff6a1a", jacket: "#3b3b44", helmet: "#ff6a1a" },
  { paint: "#2e6b5e", accent: "#c9b38a", jacket: "#5a4632", helmet: "#2e6b5e" },
  { paint: "#ff8c42", accent: "#ffd166", jacket: "#9b2d5f", helmet: "#ffd166" },
  { paint: "#1d4e89", accent: "#7fc8f8", jacket: "#16324f", helmet: "#7fc8f8" },
  { paint: "#6a994e", accent: "#f2e8cf", jacket: "#386641", helmet: "#f2e8cf" },
  { paint: "#c9184a", accent: "#ffccd5", jacket: "#590d22", helmet: "#ff4d6d" },
  { paint: "#8d3b2b", accent: "#d9a066", jacket: "#4a2c21", helmet: "#3d3d3d" },
  { paint: "#e9c46a", accent: "#2a9d8f", jacket: "#264653", helmet: "#e9c46a" },
  { paint: "#ffba08", accent: "#d00000", jacket: "#6a040f", helmet: "#d00000" },
  { paint: "#48cae4", accent: "#023e8a", jacket: "#0077b6", helmet: "#caf0f8" },
  { paint: "#6c757d", accent: "#adb5bd", jacket: "#212529", helmet: "#adb5bd" },
  { paint: "#7b2cbf", accent: "#e0aaff", jacket: "#3c096c", helmet: "#e0aaff" },
  { paint: "#b5e48c", accent: "#1a759f", jacket: "#184e77", helmet: "#b5e48c" },
  { paint: "#a68a64", accent: "#ede0d4", jacket: "#7f5539", helmet: "#582f0e" },
];

export function liveryOf(rider: RiderId): Livery {
  return LIVERIES[rider % LIVERIES.length];
}
