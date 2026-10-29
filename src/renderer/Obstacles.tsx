import { useEffect, useMemo } from "react";
import { type BufferGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import type { ObstacleKind, ObstaclePlacement, Track } from "@/race";
import { hash } from "./noise";
import { BOULDER_WIDTH, boulderModel, fallenRockModel, markerPostModel, roadSignModel } from "./obstacle-models";

const MODELS: Record<ObstacleKind, () => BufferGeometry> = {
  rock: boulderModel,
  "fallen-rock": fallenRockModel,
  sign: roadSignModel,
  post: markerPostModel,
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
    const mesh = new InstancedMesh(MODELS[kind](), material, matrices.length);
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
 * places it, rocks turned any way and as wide as the race makes them, signs
 * and posts facing the riders coming up their side of the road.
 */
function placing(track: Track, obstacle: ObstaclePlacement, index: number): Matrix4 {
  const at = track.pointAt(obstacle.distance, obstacle.offset);
  const { heading } = track.sampleAt(obstacle.distance);
  const rock = obstacle.kind === "rock" || obstacle.kind === "fallen-rock";
  // Heading 0 is north (-z): with no turn, a model's front (+z) faces back along the road, towards the riders coming up to it.
  const turn = rock ? hash(index * 7919 + 17) * Math.PI * 2 : obstacle.offset >= 0 ? 0 : Math.PI;
  const size = rock ? obstacle.radius / (BOULDER_WIDTH / 2) : 1;
  return new Matrix4().compose(
    new Vector3(at.x, at.y, at.z),
    new Quaternion().setFromAxisAngle(UP, -(heading + turn)),
    new Vector3(size, size, size),
  );
}
