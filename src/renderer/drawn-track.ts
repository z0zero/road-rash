import type { Track, TrackSample, WorldPoint } from "@/race";
import { groundDirection, seaward } from "./geography";

/** Metres of road drawn beyond the track's far end. */
const EXTENSION = 700;
/** Beyond the end, the road bends inland at up to this curvature (1/m)... */
const BEND = 1 / 160;
/** ...easing into it over this many metres. */
const EASING = 120;

const drawn = new WeakMap<Track, Track>();

/**
 * The track as the renderer draws it: the real track, with the road carried
 * on past its far end, bending inland out of sight, so a rider who has
 * finished never sees the road stop. Riders never reach the extra road.
 */
export function drawnTrack(track: Track): Track {
  let result = drawn.get(track);
  if (!result) {
    result = extend(track);
    drawn.set(track, result);
  }
  return result;
}

function extend(track: Track): Track {
  const end = track.sampleAt(track.length);
  // Bend towards the inland side: the side of the road facing away from the sea.
  const inland = seaward(end.heading, 1, track.seaHeading) > 0 ? -1 : 1;
  const count = EXTENSION + 1;
  const samples: TrackSample[] = [];
  let { x, y, z, heading } = end;
  for (let i = 0; i < count; i++) {
    const curvature = inland * BEND * Math.min(1, i / EASING);
    // Carry on climbing or descending as the road did, levelling out.
    const grade = end.grade * Math.max(0, 1 - i / EASING);
    samples.push({ x, y, z, heading, curvature, grade, bank: 0 });
    heading += curvature;
    const ahead = groundDirection(heading);
    x += ahead.x;
    y += grade;
    z += ahead.z;
  }

  const sampleAt = (distance: number): TrackSample => {
    if (distance <= track.length) return track.sampleAt(distance);
    const beyond = Math.min(EXTENSION, distance - track.length);
    const i = Math.min(EXTENSION - 1, Math.floor(beyond));
    const t = beyond - i;
    const a = samples[i];
    const b = samples[i + 1];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      heading: a.heading + (b.heading - a.heading) * t,
      curvature: a.curvature + (b.curvature - a.curvature) * t,
      grade: a.grade + (b.grade - a.grade) * t,
      bank: 0,
    };
  };

  return {
    ...track,
    length: track.length + EXTENSION,
    sampleAt,
    pointAt(distance: number, offset: number): WorldPoint {
      if (distance <= track.length) return track.pointAt(distance, offset);
      const centre = sampleAt(distance);
      const right = groundDirection(centre.heading + Math.PI / 2);
      // The extra road lies flat.
      return { x: centre.x + right.x * offset, y: centre.y, z: centre.z + right.z * offset };
    },
  };
}
