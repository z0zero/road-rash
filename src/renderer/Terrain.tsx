import { useEffect, useMemo } from "react";
import { MeshLambertMaterial } from "three";
import type { Track } from "@/race";
import { terrainFor } from "./terrain";

/** Metres of track per terrain mesh, so the camera's frustum and far plane skip the land out of sight. */
const CHUNK = 400;

/** The cliffs, slopes and shore either side of the road. */
export function Terrain({ track }: { track: Track }) {
  const { geometries, material } = useMemo(() => {
    const terrain = terrainFor(track);
    const geometries = [];
    for (let from = 0; from < track.length; from += CHUNK) {
      geometries.push(terrain.buildGeometry(from, Math.min(track.length, from + CHUNK)));
    }
    return { geometries, material: new MeshLambertMaterial({ vertexColors: true }) };
  }, [track]);
  useEffect(
    () => () => {
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
    },
    [geometries, material],
  );

  return (
    <group>
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry} material={material} receiveShadow />
      ))}
    </group>
  );
}
