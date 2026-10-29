import { useEffect, useMemo } from "react";
import type { Track } from "@/race";
import { buildChequerGeometry, buildMarkingsGeometry, buildRoadGeometry } from "./track-geometry";

/** The road, its markings, and the start and finish lines. */
export function TrackModel({ track }: { track: Track }) {
  const geometries = useMemo(
    () => ({
      road: buildRoadGeometry(track),
      markings: buildMarkingsGeometry(track),
      start: buildChequerGeometry(track, track.startDistance),
      finish: buildChequerGeometry(track, track.finishDistance),
    }),
    [track],
  );
  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries]);

  return (
    <group>
      <mesh geometry={geometries.road} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={geometries.markings} receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      {[geometries.start, geometries.finish].map((geometry, index) => (
        <mesh key={index} geometry={geometry} receiveShadow>
          <meshLambertMaterial vertexColors />
        </mesh>
      ))}
      <Gantry track={track} distance={track.startDistance} color="#f2c14e" />
      <Gantry track={track} distance={track.finishDistance} color="#ff7a3d" />
    </group>
  );
}

/** An arch over the road: two posts and a banner. */
function Gantry({ track, distance, color }: { track: Track; distance: number; color: string }) {
  const at = track.pointAt(distance, 0);
  const { heading } = track.sampleAt(distance);
  const span = track.roadHalfWidth + track.shoulderWidth + 0.6;
  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, -heading, 0]}>
      {[-span, span].map((x) => (
        <mesh key={x} position={[x, 3.2, 0]}>
          <boxGeometry args={[0.4, 6.4, 0.4]} />
          <meshStandardMaterial color="#2d2b33" />
        </mesh>
      ))}
      <mesh position={[0, 6.2, 0]}>
        <boxGeometry args={[2 * span + 0.4, 1.3, 0.3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}
