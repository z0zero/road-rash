import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { GameSession } from "@/game/session";
import type { RiderId } from "@/race";
import { riderColours } from "./rider-colours";
import { createPose, poseOf } from "./rider-pose";

const GRAVITY = 9.81;
/** Radians. */
const MAX_LEAN = 0.75;
/** How quickly the drawn lean follows the wanted lean (1/s), whatever the frame rate. */
const LEAN_RESPONSE = 9;

/**
 * One rider on their bike, in the rider's own colours: simple shapes built in
 * code, placed from the interpolated snapshots and leaning into corners.
 */
export function BikeAndRider({ session, rider }: { session: GameSession; rider: RiderId }) {
  const colours = riderColours(rider);
  const group = useRef<Group>(null);
  const lean = useRef(0);
  const pose = useRef(createPose());

  useFrame((_, delta) => {
    const bike = group.current;
    if (!bike) return;
    const view = session.view;
    const { distance, offset, speed, sideways } = poseOf(view, rider, pose.current);
    const road = view.track.sampleAt(distance);
    const at = view.track.pointAt(distance, offset);
    // Lean as a motorcycle does: into the sideways acceleration of the bend and of steering.
    const turning = speed * speed * road.curvature + (speed * sideways) / 60;
    const wanted = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, 0.7 * Math.atan(turning / GRAVITY)));
    lean.current += (wanted - lean.current) * (1 - Math.exp(-LEAN_RESPONSE * delta));
    // Face along the road, turned a little towards the sideways motion; pitch with the grade; roll with lean and bank.
    const yaw = -road.heading - Math.atan2(sideways, Math.max(speed, 1));
    bike.position.set(at.x, at.y, at.z);
    bike.rotation.set(Math.atan(road.grade), yaw, -(lean.current + road.bank), "YXZ");
  });

  return (
    <group ref={group}>
      {/* Wheels */}
      {[-0.72, 0.72].map((z) => (
        <mesh key={z} position={[0, 0.33, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.33, 0.33, 0.16, 18]} />
          <meshStandardMaterial color="#1b1a1f" roughness={0.8} />
        </mesh>
      ))}
      {/* Frame and tank */}
      <mesh position={[0, 0.62, 0.05]}>
        <boxGeometry args={[0.32, 0.36, 1.35]} />
        <meshStandardMaterial color={colours.bike} roughness={0.45} metalness={0.2} flatShading />
      </mesh>
      <mesh position={[0, 0.86, -0.35]}>
        <boxGeometry args={[0.28, 0.2, 0.5]} />
        <meshStandardMaterial color={colours.trim} roughness={0.5} flatShading />
      </mesh>
      {/* Handlebars */}
      <mesh position={[0, 0.98, -0.62]}>
        <boxGeometry args={[0.7, 0.06, 0.06]} />
        <meshStandardMaterial color="#2d2b33" />
      </mesh>
      {/* Rider: legs, torso leaning forward, helmet */}
      <mesh position={[0, 0.95, 0.25]}>
        <boxGeometry args={[0.42, 0.22, 0.55]} />
        <meshStandardMaterial color="#26304a" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 1.28, 0.02]} rotation={[-0.6, 0, 0]}>
        <boxGeometry args={[0.44, 0.62, 0.28]} />
        <meshStandardMaterial color={colours.jacket} roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 1.62, -0.24]}>
        <icosahedronGeometry args={[0.17, 1]} />
        <meshStandardMaterial color={colours.helmet} roughness={0.3} flatShading />
      </mesh>
    </group>
  );
}
