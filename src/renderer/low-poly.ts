import {
  BufferGeometry,
  Color,
  type ColorRepresentation,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { hash } from "./noise";

/** Where a part sits in its model: metres, radians about x, y and z in that order, and a scale. */
export interface Placing {
  readonly at?: readonly [number, number, number];
  readonly turn?: readonly [number, number, number];
  readonly scale?: number | readonly [number, number, number];
}

/** Makes the matrix for a placing. */
export function placingMatrix({ at = [0, 0, 0], turn = [0, 0, 0], scale = 1 }: Placing): Matrix4 {
  const size = typeof scale === "number" ? new Vector3(scale, scale, scale) : new Vector3(...scale);
  return new Matrix4().compose(
    new Vector3(...at),
    new Quaternion().setFromEuler(new Euler(turn[0], turn[1], turn[2])),
    size,
  );
}

/**
 * Builds a flat-shaded low-poly model with a colour per face from simple
 * parts. Every face gets its own normal, so the model reads as facets.
 */
export class LowPoly {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private faces = 0;

  /**
   * Adds a part: any geometry, placed, painted one colour, each face shaded a
   * little lighter or darker by up to `shade` so the facets show. The part
   * geometry is disposed of.
   */
  add(part: BufferGeometry, color: ColorRepresentation, placing: Placing | Matrix4 = {}, shade = 0.06): this {
    const matrix = placing instanceof Matrix4 ? placing : placingMatrix(placing);
    const flat = part.index ? part.toNonIndexed() : part;
    flat.applyMatrix4(matrix);
    const position = flat.getAttribute("position");
    const base = new Color(color);
    const face = new Color();
    for (let i = 0; i < position.count; i++) {
      if (i % 3 === 0) {
        face.copy(base).multiplyScalar(1 + shade * (hash(this.faces++) * 2 - 1));
      }
      this.positions.push(position.getX(i), position.getY(i), position.getZ(i));
      this.colors.push(face.r, face.g, face.b);
    }
    // A mirrored placing turns the faces inside out; put their corners back in order.
    if (matrix.determinant() < 0) {
      const from = this.positions.length - position.count * 3;
      for (let i = from; i < this.positions.length; i += 9) {
        for (let axis = 0; axis < 3; axis++) {
          const swap = this.positions[i + 3 + axis];
          this.positions[i + 3 + axis] = this.positions[i + 6 + axis];
          this.positions[i + 6 + axis] = swap;
        }
      }
    }
    if (flat !== part) flat.dispose();
    part.dispose();
    return this;
  }

  /** The finished model. */
  build(): BufferGeometry {
    const geometry = geometryFrom(this.positions, this.colors);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

/**
 * A geometry from separate triangles, given as each corner's position and
 * colour (three numbers each), and its normal where they are given, else
 * worked out: flat-shaded, as no two triangles share a corner.
 */
export function geometryFrom(positions: readonly number[], colors: readonly number[], normals?: readonly number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  if (normals) geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  return geometry;
}

/**
 * Moves every corner of a geometry by up to `amount` of its distance from the
 * origin, the same way for corners that share a position, so a rock or a
 * canopy stays closed while losing its perfect shape.
 */
export function roughen(geometry: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const key = Math.round(x * 1000) * 73_856_093 ^ Math.round(y * 1000) * 19_349_663 ^ Math.round(z * 1000) * 83_492_791;
    const factor = 1 + amount * (hash(key + seed * 7919) * 2 - 1);
    position.setXYZ(i, x * factor, y * factor, z * factor);
  }
  position.needsUpdate = true;
  return geometry;
}
