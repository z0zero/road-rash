import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import type { Track, WorldPoint } from "@/race";

/** Metres between the road mesh's cross-sections. */
const SECTION = 2;
/** Metres of embankment beyond each shoulder, sloping down towards the sea. */
const EMBANKMENT = 45;

const ASPHALT = new Color("#4b4a55");
const ASPHALT_LIGHT = new Color("#55535f");
const SHOULDER = new Color("#c9a873");
const SHOULDER_DARK = new Color("#a98a5c");
const EMBANKMENT_COLOR = new Color("#7d6b43");
const WHITE = new Color("#f2eee4");
const YELLOW = new Color("#f2c14e");
const BLACK = new Color("#1d1b22");

/** Collects flat-coloured triangles. */
class Triangles {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  /**
   * A patch of surface in one colour, facing up. Its corners, relative to the
   * race direction, go near left, near right, far right, far left: counter-
   * clockwise seen from above, which three.js draws as the front face.
   */
  surface(nearLeft: WorldPoint, nearRight: WorldPoint, farRight: WorldPoint, farLeft: WorldPoint, color: Color) {
    for (const p of [nearLeft, nearRight, farRight, nearLeft, farRight, farLeft]) {
      this.positions.push(p.x, p.y, p.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

function lifted(point: WorldPoint, metres: number): WorldPoint {
  return { x: point.x, y: point.y + metres, z: point.z };
}

/**
 * The road, its shoulders and an embankment either side, from the track's
 * own centreline samples. Road and shoulders alternate shade every 10 m so
 * speed reads at a glance.
 */
export function buildRoadGeometry(track: Track): BufferGeometry {
  const { roadHalfWidth: road, shoulderWidth } = track;
  const edge = road + shoulderWidth;
  const triangles = new Triangles();

  /** The cross-section at a distance, left to right: embankment foot, shoulder edge, road edge, road edge, shoulder edge, embankment foot. */
  const sectionAt = (distance: number) => {
    const { curvature } = track.sampleAt(distance);
    // On the inside of a tight bend the embankment stops short of the bend's centre.
    const inside = Math.max(3, Math.min(EMBANKMENT, 0.85 / Math.max(Math.abs(curvature), 1e-6) - edge));
    const foot = (side: -1 | 1) => {
      const width = Math.sign(curvature) === side ? inside : EMBANKMENT;
      const top = track.pointAt(distance, side * (edge + width));
      return { x: top.x, y: Math.max(1, top.y - width * 1.4), z: top.z };
    };
    return [
      foot(-1),
      track.pointAt(distance, -edge),
      track.pointAt(distance, -road),
      track.pointAt(distance, road),
      track.pointAt(distance, edge),
      foot(1),
    ];
  };

  let previous = sectionAt(0);
  for (let distance = SECTION; distance <= track.length; distance += SECTION) {
    const next = sectionAt(distance);
    const light = Math.floor(distance / 10) % 2 === 0;
    const shoulder = light ? SHOULDER : SHOULDER_DARK;
    const strips = [EMBANKMENT_COLOR, shoulder, light ? ASPHALT : ASPHALT_LIGHT, shoulder, EMBANKMENT_COLOR];
    strips.forEach((color, strip) => {
      triangles.surface(previous[strip], previous[strip + 1], next[strip + 1], next[strip], color);
    });
    previous = next;
  }
  return triangles.build();
}

/** Lane markings: a double yellow centre line, dashed white lane lines and solid white edge lines. */
export function buildMarkingsGeometry(track: Track): BufferGeometry {
  const triangles = new Triangles();
  const lift = 0.03;
  const line = (offset: number, width: number, color: Color, from: number, to: number) => {
    for (let d = from; d < to; d += SECTION) {
      const end = Math.min(to, d + SECTION);
      triangles.surface(
        lifted(track.pointAt(d, offset - width / 2), lift),
        lifted(track.pointAt(d, offset + width / 2), lift),
        lifted(track.pointAt(end, offset + width / 2), lift),
        lifted(track.pointAt(end, offset - width / 2), lift),
        color,
      );
    }
  };

  const edgeLine = track.roadHalfWidth - 0.25;
  for (const offset of [-0.18, 0.18]) line(offset, 0.12, YELLOW, 0, track.length);
  for (const offset of [-edgeLine, edgeLine]) line(offset, 0.15, WHITE, 0, track.length);
  for (let d = 0; d + 3 <= track.length; d += 12) {
    for (const offset of [-track.laneWidth, track.laneWidth]) line(offset, 0.15, WHITE, d, d + 3);
  }
  return triangles.build();
}

/** A chequered band across the road and shoulders at a distance, two squares deep. */
export function buildChequerGeometry(track: Track, distance: number): BufferGeometry {
  const triangles = new Triangles();
  const edge = track.roadHalfWidth;
  const square = 1;
  const lift = 0.04;
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < (2 * edge) / square; column++) {
      const from = -edge + column * square;
      const d0 = distance - square + row * square;
      const d1 = d0 + square;
      const color = (row + column) % 2 === 0 ? WHITE : BLACK;
      triangles.surface(
        lifted(track.pointAt(d0, from), lift),
        lifted(track.pointAt(d0, from + square), lift),
        lifted(track.pointAt(d1, from + square), lift),
        lifted(track.pointAt(d1, from), lift),
        color,
      );
    }
  }
  return triangles.build();
}
