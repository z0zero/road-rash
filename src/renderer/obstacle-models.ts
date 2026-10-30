import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
} from "three";
import { LowPoly, roughen } from "./low-poly";

/**
 * Flat-shaded obstacles, built in code: what riders crash into. Each stands
 * on the ground at its origin, metres high along +y, and fills about the
 * circle the race gives it (its radius), so a rider crashes where they seem
 * to touch it. A model's front faces +z: back along the road, towards the
 * riders coming up to it.
 */

/** A boulder on the shoulder this wide across its base at scale 1 (metres): scale it by its radius over half this. */
export const BOULDER_WIDTH = 1.7;

/** A weathered boulder that has come to rest on the shoulder, sunk a little into the gravel. */
export function boulderModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(roughen(new DodecahedronGeometry(0.72, 0), 0.2, 21), "#857360", { at: [0, 0.42, 0], scale: [1.15, 0.85, 1.05] }, 0.12);
  model.add(roughen(new IcosahedronGeometry(0.34, 0), 0.25, 5), "#93806b", { at: [0.5, 0.18, -0.38] }, 0.12);
  return model.build();
}

/**
 * A rock fallen from the cliff onto the road, as wide as a boulder at scale 1,
 * with chips of it scattered close by: the cliff's own red sandstone, so it
 * stands out against the tarmac.
 */
export function fallenRockModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(roughen(new DodecahedronGeometry(0.75, 0), 0.24, 13), "#b06a43", { at: [0, 0.45, 0], scale: [1.1, 0.8, 1] }, 0.14);
  model.add(roughen(new IcosahedronGeometry(0.3, 0), 0.3, 8), "#c27f4f", { at: [-0.45, 0.82, 0.15] }, 0.14);
  const chips: [number, number, number][] = [
    [0.95, 0.12, 0.35],
    [-0.9, 0.1, -0.5],
    [0.35, 0.09, -1.0],
    [-0.4, 0.08, 1.05],
  ];
  chips.forEach(([x, size, z], index) => {
    model.add(roughen(new OctahedronGeometry(size, 0), 0.3, index), "#a5643f", { at: [x, size * 0.6, z], turn: [index, index * 2, 0] }, 0.12);
  });
  return model.build();
}

/** The radius a road sign fills at scale 1, with its footing (metres): stretch it across by its radius over this. */
export const ROAD_SIGN_RADIUS = 0.3;

/** A warning sign on the shoulder: falling rocks, in a red-rimmed white triangle on a post with a concrete footing. */
export function roadSignModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(new BoxGeometry(0.55, 0.16, 0.55), "#a9a49a", { at: [0, 0.05, 0] }, 0.05);
  model.add(new CylinderGeometry(0.05, 0.05, 2.1, 6), "#8d8f96", { at: [0, 1.1, 0] });
  // Triangles standing on their bases, facing along z: a grey back, the red rim, the white face.
  const triangle = (radius: number, depth: number, color: string, z: number) =>
    model.add(new CylinderGeometry(radius, radius, depth, 3), color, { at: [0, 1.95, z], turn: [-Math.PI / 2, 0, 0] }, 0.02);
  triangle(0.52, 0.02, "#7c7f86", 0.03);
  triangle(0.52, 0.03, "#c8302a", 0.055);
  triangle(0.36, 0.02, "#f4f1ea", 0.075);
  // The rocks tumbling down it.
  model.add(new IcosahedronGeometry(0.075, 0), "#1e1a1a", { at: [0.06, 1.9, 0.09], scale: [1, 0.8, 0.3] }, 0);
  model.add(new IcosahedronGeometry(0.05, 0), "#1e1a1a", { at: [-0.08, 1.85, 0.09], scale: [1, 0.8, 0.3] }, 0);
  model.add(new IcosahedronGeometry(0.035, 0), "#1e1a1a", { at: [0.02, 2.02, 0.09], scale: [1, 0.8, 0.3] }, 0);
  return model.build();
}

/** The radius a marker post fills at scale 1 (metres): stretch it across by its radius over this. */
export const MARKER_POST_RADIUS = 0.2;

/** A marker post on the shoulder, about 1.3 m tall: white, with a black band and a red reflector near its top. */
export function markerPostModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(new CylinderGeometry(0.11, 0.13, 1.0, 6), "#f2eee4", { at: [0, 0.5, 0] }, 0.05);
  model.add(new CylinderGeometry(0.115, 0.115, 0.22, 6), "#1e1c22", { at: [0, 1.1, 0] }, 0.03);
  model.add(new BoxGeometry(0.1, 0.16, 0.04), "#ff3b26", { at: [0, 1.1, 0.11] }, 0);
  model.add(new CylinderGeometry(0.02, 0.115, 0.1, 6), "#f2eee4", { at: [0, 1.26, 0] }, 0.05);
  return model.build();
}
