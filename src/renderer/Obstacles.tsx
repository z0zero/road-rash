import { useEffect, useMemo } from "react";
import { type BufferGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import type { ObstacleKind, ObstaclePlacement, Track } from "@/race";
import { hash } from "./noise";
import {
  BOULDER_WIDTH,
  boulderModel,
  fallenRockModel,
  MARKER_POST_RADIUS,
  markerPostModel,
  ROAD_SIGN_RADIUS,
  roadSignModel,
} from "./obstacle-models";

/** Each kind's model, and the radius it fills at scale 1 (metres), to size it to the radius the race gives each obstacle. */
const MODELS: Record<ObstacleKind, { readonly build: () => BufferGeometry; readonly radius: number }> = {
  rock: { build: boulderModel, radius: BOULDER_WIDTH / 2 },
  "fallen-rock": { build: fallenRockModel, radius: BOULDER_WIDTH / 2 },
  sign: { build: roadSignModel, radius: ROAD_SIGN_RADIUS },
  post: { build: markerPostModel, radius: MARKER_POST_RADIUS },
};

/**
 * The obstacles riders crash into, from the track's obstacle placement: rocks,
 * signs and posts on the shoulders, and rocks fallen onto the road near some
 * hairpins, each kind drawn with instancing where the race says it stands.
 */
export function Obstacles({ track }: { track: Track }) {
  const { meshes, material } = useMemo(() => buildObstacles(track), [track]);
  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
    },
    [meshes, material],
  );

  return (
    <group>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}

function buildObstacles(track: Track) {
  const material = new MeshLambertMaterial({ vertexColors: true });
  const placed = new Map<ObstacleKind, Matrix4[]>();
  track.obstacles.forEach((obstacle, index) => {
    const matrices = placed.get(obstacle.kind) ?? [];
    matrices.push(placing(track, obstacle, index));
    placed.set(obstacle.kind, matrices);
  });
  const meshes = [...placed].map(([kind, matrices]) => {
    const mesh = new InstancedMesh(MODELS[kind].build(), material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });
  return { meshes, material };
}

const UP = new Vector3(0, 1, 0);

/**
 * Where an obstacle's model stands: on the road or the shoulder where the race
 * places it, as wide as the race makes it, rocks turned any way and grown to
 * their width, signs and posts at their own height facing the riders coming
 * up their side of the road.
 */
function placing(track: Track, obstacle: ObstaclePlacement, index: number): Matrix4 {
  const at = track.pointAt(obstacle.distance, obstacle.offset);
  const { heading } = track.sampleAt(obstacle.distance);
  const rock = obstacle.kind === "rock" || obstacle.kind === "fallen-rock";
  // Heading 0 is north (-z): with no turn, a model's front (+z) faces back along the road, towards the riders coming up to it.
  const turn = rock ? hash(index * 7919 + 17) * Math.PI * 2 : obstacle.offset >= 0 ? 0 : Math.PI;
  const across = obstacle.radius / MODELS[obstacle.kind].radius;
  return new Matrix4().compose(
    new Vector3(at.x, at.y, at.z),
    new Quaternion().setFromAxisAngle(UP, -(heading + turn)),
    new Vector3(across, rock ? across : 1, across),
  );
}
