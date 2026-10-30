import { type BufferGeometry, Color } from "three";
import type { Track, WorldPoint } from "@/race";
import { geometryFrom } from "./low-poly";

/** Metres between the road mesh's cross-sections. */
const SECTION = 2;
/** Metres of rumble strip along each edge of the road, on the shoulder. */
const RUMBLE_WIDTH = 0.7;

const ASPHALT = new Color("#5d5b66");
const ASPHALT_LIGHT = new Color("#676570");
const SHOULDER = new Color("#b99a6c");
const SHOULDER_DARK = new Color("#a6875c");
const RUMBLE_RED = new Color("#b5352b");
const RUMBLE_WHITE = new Color("#ece5d8");
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
    return geometryFrom(this.positions, this.colors);
  }
}

function lifted(point: WorldPoint, metres: number): WorldPoint {
  return { x: point.x, y: point.y + metres, z: point.z };
}

/**
 * The road and its shoulders, from the track's own centreline samples, with
 * red and white rumble strips along both edges. Road and shoulders alternate
 * shade every 10 m and the rumble strips every 2 m, so speed reads at a glance.
 * The land beyond the shoulders is the terrain's.
 */
export function buildRoadGeometry(track: Track): BufferGeometry {
  const { roadHalfWidth: road, shoulderWidth } = track;
  const edge = road + shoulderWidth;
  const rumble = road + RUMBLE_WIDTH;
  const triangles = new Triangles();

  /** The cross-section at a distance, left to right: shoulder edge, rumble strip, road edge, road edge, rumble strip, shoulder edge. */
  const sectionAt = (distance: number) =>
    [-edge, -rumble, -road, road, rumble, edge].map((offset) => track.pointAt(distance, offset));

  let previous = sectionAt(0);
  for (let distance = SECTION; distance <= track.length; distance += SECTION) {
    const next = sectionAt(distance);
    const light = Math.floor(distance / 10) % 2 === 0;
    const shoulder = light ? SHOULDER : SHOULDER_DARK;
    const rumbleStrip = Math.round(distance / SECTION) % 2 === 0 ? RUMBLE_RED : RUMBLE_WHITE;
    const strips = [shoulder, rumbleStrip, light ? ASPHALT : ASPHALT_LIGHT, rumbleStrip, shoulder];
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
