import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
} from "three";
import { LowPoly, roughen } from "./low-poly";

/**
 * Flat-shaded scenery models, built in code. Each stands on the ground at its
 * origin, metres high along +y. A model's front faces +z: for a placement with
 * no turn, that is back along the road, towards the riders coming up to it.
 */

const TRUNK = "#7a5838";
const TRUNK_RING = "#5f4129";
const FROND = "#4d7f37";
const FROND_DARK = "#3c6a2f";

/** A palm about 8 m tall, its trunk curving as it rises, under a crown of drooping fronds. */
export function palmModel(): BufferGeometry {
  const model = new LowPoly();
  const segments = 7;
  let x = 0;
  let y = -0.6;
  let lean = 0;
  for (let i = 0; i < segments; i++) {
    const height = 1.15;
    const radius = 0.24 - i * 0.017;
    lean += 0.045;
    model.add(new CylinderGeometry(radius - 0.02, radius, height, 6), i % 2 === 0 ? TRUNK : TRUNK_RING, {
      at: [x + Math.sin(lean) * height * 0.5, y + Math.cos(lean) * height * 0.5, 0],
      turn: [0, 0, -lean],
    });
    x += Math.sin(lean) * height;
    y += Math.cos(lean) * height;
  }
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const around = (i / fronds) * Math.PI * 2 + (i % 2) * 0.2;
    const color = i % 2 === 0 ? FROND : FROND_DARK;
    // Each frond rises a little from the crown, then droops: two flat blades end to end.
    const inner = { length: 1.8, tilt: -0.25 - (i % 3) * 0.08 };
    const outer = { length: 1.8, tilt: 0.55 + (i % 3) * 0.1 };
    const dx = Math.cos(around);
    const dz = Math.sin(around);
    const midX = x + dx * inner.length * Math.cos(inner.tilt);
    const midY = y - inner.length * Math.sin(inner.tilt);
    const midZ = dz * inner.length * Math.cos(inner.tilt);
    model.add(new BoxGeometry(inner.length, 0.05, 0.62), color, {
      at: [(x + midX) / 2, (y + midY) / 2, midZ / 2],
      turn: [0, -around, -inner.tilt],
    });
    model.add(new BoxGeometry(outer.length, 0.05, 0.5), color, {
      at: [midX + dx * outer.length * 0.5 * Math.cos(outer.tilt), midY - outer.length * 0.5 * Math.sin(outer.tilt), midZ + dz * outer.length * 0.5 * Math.cos(outer.tilt)],
      turn: [0, -around, -outer.tilt],
    });
  }
  for (let i = 0; i < 3; i++) {
    const around = i * 2.1;
    model.add(new IcosahedronGeometry(0.17, 0), "#4a3523", {
      at: [x + Math.cos(around) * 0.25, y - 0.25, Math.sin(around) * 0.25],
    });
  }
  return model.build();
}

const PINE_BARK = "#6a4a3b";
const NEEDLES = "#2f5a34";
const NEEDLES_LIGHT = "#3d6c3b";

/** A Mediterranean stone pine about 10 m tall: a bare, leaning trunk under a flat umbrella of needles. */
export function stonePineModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(new CylinderGeometry(0.2, 0.32, 7.5, 6), PINE_BARK, { at: [0.35, 3.2, 0], turn: [0, 0, -0.09] });
  model.add(new CylinderGeometry(0.1, 0.16, 2.6, 5), PINE_BARK, { at: [-0.5, 6.4, 0.2], turn: [0.2, 0, 0.75] });
  const blobs: [number, number, number, number][] = [
    [0.6, 7.6, 0, 3.4],
    [-1.6, 7.0, 0.6, 2.2],
    [2.2, 7.1, -0.9, 2.1],
    [0.2, 7.3, 1.9, 2.0],
  ];
  blobs.forEach(([x, y, zz, radius], index) => {
    model.add(roughen(new IcosahedronGeometry(radius, 1), 0.12, index), index % 2 === 0 ? NEEDLES : NEEDLES_LIGHT, {
      at: [x, y, zz],
      scale: [1, 0.38, 1],
    });
  });
  return model.build();
}

/** A conical pine about 9 m tall. */
export function conicalPineModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(new CylinderGeometry(0.14, 0.22, 2.4, 5), PINE_BARK, { at: [0, 0.6, 0] });
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const radius = 2.3 - i * 0.45;
    const height = 3.2 - i * 0.35;
    model.add(new ConeGeometry(radius, height, 7), i % 2 === 0 ? NEEDLES : NEEDLES_LIGHT, {
      at: [0, 2.4 + i * 1.55 + height / 2, 0],
      turn: [0, i * 0.4, 0],
    });
  }
  return model.build();
}

/** A weathered boulder about 1.6 m across, sunk a little into the ground. */
export function rockModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(roughen(new DodecahedronGeometry(0.85, 0), 0.22, 3), "#7f6a58", { at: [0, 0.35, 0], scale: [1.2, 0.75, 1] }, 0.1);
  model.add(roughen(new IcosahedronGeometry(0.45, 0), 0.25, 9), "#8d7663", { at: [0.75, 0.15, 0.35] }, 0.1);
  return model.build();
}

const WALL = "#eadcc6";
const WALL_SHADE = "#d6c4aa";
const ROOF = "#b4553c";
const ROOF_DARK = "#943f2d";
const WOOD = "#5b3b27";
const SHUTTER = "#3f6f73";

/** A small whitewashed house with a terracotta roof, its door on the front (+z). */
export function houseModel(): BufferGeometry {
  const model = new LowPoly();
  // Walls, standing on a plinth that reaches down into sloping ground.
  model.add(new BoxGeometry(7.4, 2.2, 6.4), WALL_SHADE, { at: [0, -0.6, 0] });
  model.add(new BoxGeometry(7, 3.8, 6), WALL, { at: [0, 2.4, 0] }, 0.03);
  // A pitched roof: two slopes meeting at a ridge along x, with gable ends.
  const pitch = 0.5;
  const slope = 3.5 / Math.cos(pitch);
  for (const side of [-1, 1]) {
    model.add(new BoxGeometry(7.8, 0.22, slope), side < 0 ? ROOF : ROOF_DARK, {
      at: [0, 4.3 + (Math.tan(pitch) * 3.5) / 2 + 0.1, (side * 3.5) / 2],
      turn: [side * pitch, 0, 0],
    });
  }
  const rise = Math.tan(pitch) * 3.5;
  for (const side of [-1, 1]) {
    // Gable: a three-sided prism, turned so its triangle stands on the end wall's top with the apex up.
    // Its triangle has corners 1.2 out at the apex and 0.6 back at the base, 1.04 either side.
    model.add(new CylinderGeometry(1.2, 1.2, 0.2, 3), WALL, {
      at: [side * 3.4, 4.3 + 0.6 * (rise / 1.8), 0],
      turn: [-Math.PI / 2, 0, -Math.PI / 2],
      scale: [3 / 1.04, 1, rise / 1.8],
    });
  }
  model.add(new BoxGeometry(0.6, 1.4, 0.6), WALL_SHADE, { at: [2, 5.6, -1.2] });
  // Door, shutters and a step on the front.
  model.add(new BoxGeometry(1.1, 2.1, 0.12), WOOD, { at: [0.9, 1.55, 3.03] });
  model.add(new BoxGeometry(1.6, 0.25, 0.8), WALL_SHADE, { at: [0.9, 0.55, 3.35] });
  for (const x of [-2.2, 2.6]) {
    for (const side of [-1, 1]) {
      model.add(new BoxGeometry(0.35, 1.2, 0.08), SHUTTER, { at: [x + side * 0.72, 2.7, 3.04] });
    }
  }
  return model.build();
}

/** The house's windows, lit from inside: drawn with a glowing material so they bloom. */
export function houseWindowsModel(): BufferGeometry {
  const model = new LowPoly();
  for (const [x, zz] of [
    [-2.2, 3.02],
    [2.6, 3.02],
  ]) {
    model.add(new BoxGeometry(1.05, 1.15, 0.06), "#ffd28a", { at: [x - 0.4, 2.7, zz] }, 0);
  }
  for (const side of [-1, 1]) {
    model.add(new BoxGeometry(0.06, 1.0, 1.0), "#ffc777", { at: [side * 3.52, 2.6, -0.8] }, 0);
  }
  return model.build();
}

/** A curve-warning sign: a yellow diamond on a post with a chevron pointing into the bend, facing +z. */
export function curveSignModel(bendsRight: boolean): BufferGeometry {
  const model = new LowPoly();
  model.add(new CylinderGeometry(0.05, 0.05, 2.6, 5), "#8d8f96", { at: [0, 1.3, 0] });
  model.add(new BoxGeometry(0.95, 0.95, 0.05), "#f2c230", { at: [0, 2.35, 0.06], turn: [0, 0, Math.PI / 4] }, 0);
  model.add(new BoxGeometry(1.42, 1.42, 0.04), "#1e1a1a", { at: [0, 2.35, 0.03], turn: [0, 0, Math.PI / 4], scale: [0.72, 0.72, 1] }, 0);
  const point = bendsRight ? 1 : -1;
  for (const arm of [-1, 1]) {
    model.add(new BoxGeometry(0.42, 0.12, 0.04), "#1e1a1a", {
      at: [point * 0.06, 2.35 + arm * 0.12, 0.1],
      turn: [0, 0, -arm * point * 0.8],
    }, 0);
  }
  return model.build();
}

/**
 * One 4 m stretch of guard rail: a steel beam on a post, running from z = 0
 * forwards to z = -1 so it can be stretched to the stretch's length.
 */
export function guardRailModel(): BufferGeometry {
  const model = new LowPoly();
  model.add(new BoxGeometry(0.1, 0.34, 1.02), "#b9b7b5", { at: [0, 0.68, -0.5] }, 0.02);
  model.add(new BoxGeometry(0.06, 0.1, 1.02), "#8f8d8c", { at: [0.04, 0.52, -0.5] }, 0);
  model.add(new BoxGeometry(0.12, 0.85, 0.035), "#55575c", { at: [-0.05, 0.36, -0.02] }, 0);
  model.add(new OctahedronGeometry(0.035, 0), "#ff6a3c", { at: [0.07, 0.68, -0.02] }, 0);
  return model.build();
}
