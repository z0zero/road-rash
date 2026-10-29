import { useEffect, useMemo } from "react";
import {
  type BufferGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { SceneryPlacement, Track } from "@/race";
import {
  conicalPineModel,
  curveSignModel,
  guardRailModel,
  houseModel,
  houseWindowsModel,
  palmModel,
  rockModel,
  stonePineModel,
} from "./scenery-models";
import { hash } from "./noise";
import { type Terrain, terrainFor } from "./terrain";

/** Metres of track per batch of instances, so the camera's frustum and far plane skip the scenery out of sight. */
const CHUNK = 500;
/** Metres of guard rail per placement. */
const GUARD_RAIL_LENGTH = 4;

type Model =
  | "palm"
  | "stone-pine"
  | "conical-pine"
  | "rock"
  | "house"
  | "house-windows"
  | "sign-left"
  | "sign-right"
  | "guard-rail";

/**
 * The palms, pines, rocks, houses, signs and guard rails beside the road, from
 * the track's scenery placement: each model drawn with instancing, in batches
 * along the track, every item standing on the land the terrain describes.
 */
export function Scenery({ track }: { track: Track }) {
  const meshes = useMemo(() => buildScenery(track), [track]);
  useEffect(
    () => () => {
      const disposed = new Set<{ dispose(): void }>();
      for (const mesh of meshes) {
        const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const resource of [mesh.geometry, ...materials]) {
          if (!disposed.has(resource)) resource.dispose();
          disposed.add(resource);
        }
        mesh.dispose();
      }
    },
    [meshes],
  );

  return (
    <group>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}

function buildScenery(track: Track): InstancedMesh[] {
  const terrain = terrainFor(track);
  const geometries: Record<Model, BufferGeometry> = {
    palm: palmModel(),
    "stone-pine": stonePineModel(),
    "conical-pine": conicalPineModel(),
    rock: rockModel(),
    house: houseModel(),
    "house-windows": houseWindowsModel(),
    "sign-left": curveSignModel(false),
    "sign-right": curveSignModel(true),
    "guard-rail": guardRailModel(),
  };
  const solid = new MeshLambertMaterial({ vertexColors: true });
  // Windows lit from inside at dusk: bright enough to bloom.
  const lit = new MeshLambertMaterial({ vertexColors: true, emissive: "#ffb45e", emissiveIntensity: 3.2 });

  const batches = new Map<string, { model: Model; matrices: Matrix4[] }>();
  const add = (model: Model, distance: number, matrix: Matrix4) => {
    const key = `${model}:${Math.floor(distance / CHUNK)}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { model, matrices: [] };
      batches.set(key, batch);
    }
    batch.matrices.push(matrix);
  };

  track.scenery.forEach((item, index) => {
    for (const [model, matrix] of placeItem(track, terrain, item, index)) add(model, item.distance, matrix);
  });

  const meshes: InstancedMesh[] = [];
  for (const { model, matrices } of batches.values()) {
    const mesh = new InstancedMesh(geometries[model], model === "house-windows" ? lit : solid, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = model !== "house-windows";
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

const UP = new Vector3(0, 1, 0);
/** Trees and houses stand where the land rises no more than this many metres per metre... */
const STEEPEST_FOOTING = 1;
/** ...and boulders, sunk deeper, where it rises up to this much... */
const STEEPEST_FOOTING_FOR_ROCKS = 1.8;
/** ...looking up to this far either way across the road for such a place (metres)... */
const FOOTING_SEARCH = 18;
/** ...never closer to the road than this beyond the shoulder (metres)... */
const FOOTING_CLEARANCE = 2.5;
/** ...and never in the sea. */
const SHORE = 0.5;

/** The models and their transforms that draw one scenery item; none if it finds nowhere to stand. */
function placeItem(track: Track, terrain: Terrain, item: SceneryPlacement, index: number): [Model, Matrix4][] {
  const { heading } = track.sampleAt(item.distance);
  const placed = track.pointAt(item.distance, item.offset);
  const stands = item.kind === "palm" || item.kind === "pine" || item.kind === "rock" || item.kind === "house";
  const at = stands
    ? footing(track, terrain, item, item.kind === "rock" ? STEEPEST_FOOTING_FOR_ROCKS : STEEPEST_FOOTING)
    : { ...placed, slope: 0 };
  if (!at) return [];
  const ground = terrain.groundAt(at.x, at.z);
  const random = hash(index * 2654435761);
  // Heading 0 is north (-z); a model's -z points along the road's heading turned by the item's yaw.
  const facing = new Quaternion().setFromAxisAngle(UP, -(heading + item.yaw));
  const standing = (sink: number, scale: Vector3) =>
    new Matrix4().compose(new Vector3(at.x, ground - sink, at.z), facing, scale);
  const uniform = new Vector3(item.scale, item.scale, item.scale);

  switch (item.kind) {
    case "palm":
      return [["palm", standing(0, uniform)]];
    case "pine":
      return [[random < 0.55 ? "stone-pine" : "conical-pine", standing(0, uniform)]];
    case "rock": {
      const squash = new Vector3(item.scale * (0.8 + 0.5 * random), item.scale * (0.7 + 0.4 * hash(index + 99)), item.scale);
      // Sunk deeper on a slope, so its downhill side doesn't float.
      return [["rock", standing(0.3 * item.scale * (1 + at.slope), squash)]];
    }
    case "house": {
      const house = standing(0, uniform);
      return [
        ["house", house],
        ["house-windows", house],
      ];
    }
    case "sign": {
      // The sign warns of the sharp bend about 90 m on.
      const bendsRight = track.sampleAt(item.distance + 90).curvature > 0;
      return [[bendsRight ? "sign-right" : "sign-left", standing(0, uniform)]];
    }
    case "guard-rail": {
      const end = track.pointAt(item.distance + GUARD_RAIL_LENGTH, item.offset);
      const from = new Vector3(at.x, ground, at.z);
      const to = new Vector3(end.x, terrain.groundAt(end.x, end.z), end.z);
      // Stretch the 1 m model along the rail's own run, from `from` (z = 0) to `to` (z = -1).
      const back = from.clone().sub(to);
      const length = back.length();
      back.normalize();
      const side = new Vector3().crossVectors(UP, back).normalize();
      const up = new Vector3().crossVectors(back, side).normalize();
      const matrix = new Matrix4().makeBasis(side, up, back.multiplyScalar(length));
      matrix.setPosition(from);
      return [["guard-rail", matrix]];
    }
  }
}

/**
 * The nearest firm place for an item to stand, at its placement or moved
 * across the road's line, out from it or back towards it (but no nearer than
 * FOOTING_CLEARANCE beyond the shoulder): ground that rises no more than
 * `steepest` metres per metre and lies above the shore, so nothing floats off
 * a cliff face or stands in the sea. Also says how steep the ground there is;
 * null if there is nowhere.
 */
function footing(track: Track, terrain: Terrain, item: SceneryPlacement, steepest: number) {
  const side = Math.sign(item.offset);
  const nearest = track.roadHalfWidth + track.shoulderWidth + FOOTING_CLEARANCE;
  for (let step = 0; step <= FOOTING_SEARCH; step += 1.5) {
    for (const direction of step === 0 ? [1] : [1, -1]) {
      const offset = item.offset + side * direction * step;
      if (Math.abs(offset) < nearest || Math.sign(offset) !== side) continue;
      const { x, z } = track.pointAt(item.distance, offset);
      const y = terrain.groundAt(x, z);
      if (y < SHORE) continue;
      const slope = terrain.slopeAt(x, z);
      if (slope <= steepest) return { x, y, z, slope };
    }
  }
  return null;
}
