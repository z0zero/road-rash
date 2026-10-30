import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { CarKind } from "@/race";
import { LowPoly, type Placing } from "./low-poly";
import { hash } from "./noise";

/**
 * Flat-shaded cars, built in code: a hatchback, a saloon, a van and a pickup.
 * Each stands on the ground with the middle of its length and width at the
 * origin and its front facing -z, as the race measures a car from its middle.
 * A car comes in three parts: its bodywork, painted white so each car can be
 * tinted its own colour; its trim (glass, tyres, bumpers), which keeps its
 * colours; and its lamps, which glow.
 */
export interface CarModel {
  readonly body: BufferGeometry;
  readonly trim: BufferGeometry;
  readonly lamps: BufferGeometry;
  /** Metres from bumper to bumper, and from side to side. */
  readonly length: number;
  readonly width: number;
}

/** Car paints, from everyday silver and white to the odd bright one. */
const PAINTS: readonly Color[] = [
  "#c3c8cd",
  "#ece8de",
  "#b83a2e",
  "#2d5b8c",
  "#3d454d",
  "#2f6a4d",
  "#d6a23c",
  "#7c2d45",
  "#5aa1b3",
  "#e0773a",
].map((paint) => new Color(paint));

/**
 * The paint of the car with this id: the same car keeps its colour, and the
 * next car along most likely has another. Shared: read it, never change it.
 */
export function paintOf(carId: number): Readonly<Color> {
  return PAINTS[Math.floor(hash(carId * 7 + 3) * PAINTS.length)];
}

/** Painted parts are white: each car's own colour tints them. */
const PAINT = "#ffffff";
const GLASS = "#26313d";
const TYRE = "#1b1a1f";
const HUBCAP = "#9a9ca3";
const BUMPER = "#34343b";
const CHROME = "#b9bcc2";
const GRILLE = "#1f1f25";
const BED_LINER = "#2b2a2f";
/** The lamps glow brighter than white, so they bloom: the headlamps bright, the tail lamps a deep red glow. */
const HEADLAMP = new Color("#fff1cf").multiplyScalar(3.2);
const TAIL_LAMP = new Color("#ff2a1a").multiplyScalar(1.7);

const WHEEL_RADIUS = 0.32;

/**
 * How to build the model of each kind of car the race has, so typecheck
 * catches a kind with no model. Each call builds new geometries; dispose of
 * them when done.
 */
export const CAR_MODELS: Readonly<Record<CarKind, () => CarModel>> = { hatchback, saloon, van, pickup };

/** Whether `kind` names a kind of car there is a model for. */
export function isCarKind(kind: string): kind is CarKind {
  return Object.hasOwn(CAR_MODELS, kind);
}

/** The three parts a car is built from as it is put together. */
class CarParts {
  readonly body = new LowPoly();
  readonly trim = new LowPoly();
  readonly lamps = new LowPoly();

  constructor(
    readonly length: number,
    readonly width: number,
  ) {}

  /** Four wheels, with the axles `front` and `rear` metres from the car's middle, and the front and back bumpers. */
  chassis(front: number, rear: number, bumperHeight: number) {
    const { length, width } = this;
    // The tyres stand a little proud of the bodywork.
    const across = width / 2 - 0.08;
    for (const z of [-front, rear]) {
      for (const side of [-1, 1]) {
        const wheel: Placing = { at: [side * across, WHEEL_RADIUS, z], turn: [0, 0, Math.PI / 2] };
        this.trim.add(new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.24, 10), TYRE, wheel, 0.04);
        this.trim.add(new CylinderGeometry(0.17, 0.17, 0.26, 10), HUBCAP, wheel, 0.02);
      }
    }
    for (const end of [-1, 1]) {
      this.trim.add(new BoxGeometry(width + 0.04, 0.2, 0.16), BUMPER, { at: [0, bumperHeight, end * (length / 2 - 0.06)] });
    }
    return this;
  }

  /** Two headlamps and a grille between them on the front, at `height`; two tail lamps on the back at `tailHeight`. */
  lights(height: number, tailHeight: number, front = -this.length / 2, back = this.length / 2) {
    const { width } = this;
    for (const side of [-1, 1]) {
      this.lamps.add(new BoxGeometry(0.32, 0.12, 0.04), HEADLAMP, { at: [side * (width / 2 - 0.27), height, front - 0.01] }, 0);
      this.lamps.add(new BoxGeometry(0.2, 0.16, 0.04), TAIL_LAMP, { at: [side * (width / 2 - 0.17), tailHeight, back + 0.01] }, 0);
    }
    this.trim.add(new BoxGeometry(width * 0.42, 0.14, 0.03), GRILLE, { at: [0, height - 0.02, front - 0.005] }, 0.02);
    return this;
  }

  /**
   * The cabin: its windows all round, as one block of glass tapering from
   * `bottom` (metres above the ground) up to a painted roof `height` above it,
   * framed by painted pillars at its corners and, with `doors` of two rows,
   * between them. It runs from `from` to `to` along the car at the bottom
   * (metres, front negative) and from `roofFrom` to `roofTo` at the top.
   */
  cabin(bottom: number, height: number, from: number, to: number, roofFrom: number, roofTo: number, doors: 1 | 2 = 2) {
    const width = this.width - 0.08;
    const roofWidth = this.width - 0.34;
    const top = bottom + height;
    this.trim.add(taperedBlock(width, from, to, roofWidth, roofFrom, roofTo, height), GLASS, { at: [0, bottom, 0] }, 0.04);
    this.body.add(new BoxGeometry(roofWidth + 0.04, 0.07, roofTo - roofFrom + 0.06), PAINT, {
      at: [0, top + 0.03, (roofFrom + roofTo) / 2],
    });
    const along: [number, number][] = [
      [from, roofFrom],
      [to, roofTo],
    ];
    if (doors === 2) along.push([(from + to) / 2, (roofFrom + roofTo) / 2]);
    for (const side of [-1, 1]) {
      for (const [low, high] of along) {
        this.body.add(new BoxGeometry(1, 1, 1), PAINT, strut([side * (width / 2), bottom, low], [side * (roofWidth / 2), top, high], 0.1));
      }
    }
    return this;
  }

  build(): CarModel {
    return { body: this.body.build(), trim: this.trim.build(), lamps: this.lamps.build(), length: this.length, width: this.width };
  }
}

/** A small hatchback, 3.9 m long: a short bonnet and a cabin that runs to its steep tailgate. */
function hatchback(): CarModel {
  const parts = new CarParts(3.9, 1.75).chassis(1.2, 1.3, 0.42).lights(0.72, 0.8);
  parts.body.add(new BoxGeometry(1.75, 0.56, 3.86), PAINT, { at: [0, 0.6, 0] });
  parts.cabin(0.88, 0.56, -0.75, 1.88, -0.12, 1.66);
  return parts.build();
}

/** A saloon, 4.6 m long: bonnet, cabin and boot. */
function saloon(): CarModel {
  const parts = new CarParts(4.6, 1.8).chassis(1.42, 1.38, 0.42).lights(0.7, 0.76);
  parts.body.add(new BoxGeometry(1.8, 0.52, 4.56), PAINT, { at: [0, 0.58, 0] });
  // The boot lid rises a little behind the cabin.
  parts.body.add(new BoxGeometry(1.72, 0.08, 0.95), PAINT, { at: [0, 0.87, 1.75] });
  parts.cabin(0.84, 0.55, -0.85, 1.25, -0.3, 0.8);
  return parts.build();
}

/** A delivery van, 5 m long and 2 m tall: a stubby bonnet under a raked windscreen, and a tall box behind. */
function van(): CarModel {
  const length = 5;
  const width = 2;
  const front = -length / 2;
  const parts = new CarParts(length, width).chassis(1.75, 1.6, 0.45).lights(0.82, 0.95);
  parts.body.add(new BoxGeometry(width, 0.72, length - 0.04), PAINT, { at: [0, 0.74, 0] });
  // The box, its front raked back from the top of the bonnet to the roof.
  const rake = { bottom: 1.1, top: 2.08, from: front + 0.7, roofFrom: front + 1.3 };
  parts.body.add(taperedBlock(width, rake.from, length / 2, width - 0.08, rake.roofFrom, length / 2, rake.top - rake.bottom), PAINT, {
    at: [0, rake.bottom, 0],
  });
  // The windscreen, lying on the raked front a little above its middle, and the cab's side windows.
  const rise = rake.top - rake.bottom;
  const run = rake.roofFrom - rake.from;
  const face = Math.hypot(rise, run);
  const [up, out] = [0.55 * face, 0.025];
  parts.trim.add(new BoxGeometry(width - 0.3, 0.72 * face, 0.04), GLASS, {
    at: [0, rake.bottom + (rise * up + run * out) / face, rake.from + (run * up - rise * out) / face],
    turn: [Math.atan2(run, rise), 0, 0],
  }, 0.02);
  for (const side of [-1, 1]) {
    parts.trim.add(new BoxGeometry(0.04, 0.55, 0.85), GLASS, { at: [side * (width / 2 + 0.005), 1.55, front + 1.75] }, 0.02);
    // A stripe along the box.
    parts.trim.add(new BoxGeometry(0.03, 0.1, length - 2.3), CHROME, { at: [side * (width / 2 + 0.01), 1.2, 0.95] }, 0.02);
  }
  return parts.build();
}

/** A pickup, 5.3 m long: a cab with an open bed behind it. */
function pickup(): CarModel {
  const length = 5.3;
  const width = 1.95;
  const front = -length / 2;
  const parts = new CarParts(length, width).chassis(1.75, 1.55, 0.48).lights(0.86, 0.95);
  parts.body.add(new BoxGeometry(width, 0.64, length - 0.04), PAINT, { at: [0, 0.76, 0] });
  parts.cabin(1.08, 0.66, front + 1.55, front + 3.15, front + 2.05, front + 3.05, 1);
  // The bed: a dark floor between low sides, and the tailgate.
  const bedFrom = front + 3.2;
  const bedLength = length / 2 - bedFrom;
  const bedMiddle = (bedFrom + length / 2) / 2;
  parts.trim.add(new BoxGeometry(width - 0.2, 0.03, bedLength - 0.12), BED_LINER, { at: [0, 1.09, bedMiddle] }, 0.03);
  for (const side of [-1, 1]) {
    parts.body.add(new BoxGeometry(0.1, 0.36, bedLength), PAINT, { at: [side * (width / 2 - 0.05), 1.26, bedMiddle] });
  }
  parts.body.add(new BoxGeometry(width, 0.36, 0.1), PAINT, { at: [0, 1.26, length / 2 - 0.05] });
  parts.body.add(new BoxGeometry(width, 0.4, 0.1), PAINT, { at: [0, 1.28, bedFrom] });
  return parts.build();
}

const UP = new Vector3(0, 1, 0);

/** Places a unit cube as a strut `thickness` square from `from` to `to`. */
function strut(from: readonly [number, number, number], to: readonly [number, number, number], thickness: number): Matrix4 {
  const start = new Vector3(...from);
  const run = new Vector3(...to).sub(start);
  const length = run.length();
  return new Matrix4().compose(
    start.addScaledVector(run, 0.5),
    new Quaternion().setFromUnitVectors(UP, run.normalize()),
    new Vector3(thickness, length, thickness),
  );
}

/**
 * A block whose bottom is `width` wide and runs from `from` to `to` along z,
 * and whose top, `height` above it, is `topWidth` wide and runs from
 * `topFrom` to `topTo`: a cabin's glass, or a van's raked box.
 */
function taperedBlock(width: number, from: number, to: number, topWidth: number, topFrom: number, topTo: number, height: number) {
  const [w, t] = [width / 2, topWidth / 2];
  // Bottom corners, then top corners: front left, front right, back right, back left.
  const b0 = [-w, 0, from];
  const b1 = [w, 0, from];
  const b2 = [w, 0, to];
  const b3 = [-w, 0, to];
  const t0 = [-t, height, topFrom];
  const t1 = [t, height, topFrom];
  const t2 = [t, height, topTo];
  const t3 = [-t, height, topTo];
  // Each face as two triangles, counter-clockwise seen from outside.
  const triangles = [
    [t0, t3, t2], [t0, t2, t1], // top
    [b0, b1, b2], [b0, b2, b3], // bottom
    [b0, t0, t1], [b0, t1, b1], // front
    [b2, t2, t3], [b2, t3, b3], // back
    [b1, t1, t2], [b1, t2, b2], // right
    [b3, t3, t0], [b3, t0, b0], // left
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(triangles.flat(2), 3));
  return geometry;
}
