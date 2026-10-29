import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { GameSession } from "@/game/session";
import { PLAYER } from "@/race";
import { createPose, poseOf } from "./rider-pose";

const GRAVITY = 9.81;
const MAX_LEAN = 0.75;

/**
 * The player's bike and rider: simple shapes built in code, placed from the
 * interpolated snapshots and leaning into corners.
 */
export function BikeAndRider({ session }: { session: GameSession }) {
  const group = useRef<Group>(null);
  const lean = useRef(0);
  const pose = useRef(createPose());

  useFrame(() => {
    const bike = group.current;
    if (!bike) return;
    const view = session.view;
    const { distance, offset, speed, sideways } = poseOf(view, PLAYER, pose.current);
    const road = view.track.sampleAt(distance);
    const at = view.track.pointAt(distance, offset);
    // Lean as a motorcycle does: into the sideways acceleration of the bend and of steering.
    const turning = speed * speed * road.curvature + (speed * sideways) / 60;
    const wanted = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, 0.7 * Math.atan(turning / GRAVITY)));
    lean.current += (wanted - lean.current) * 0.15;
    bike.position.set(at.x, at.y, at.z);
    bike.rotation.set(Math.atan(road.grade), -road.heading - Math.atan2(sideways, Math.max(speed, 1)), -(lean.current + road.bank), "YXZ");
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
        <meshStandardMaterial color="#d6332a" roughness={0.45} metalness={0.2} flatShading />
      </mesh>
      <mesh position={[0, 0.86, -0.35]}>
        <boxGeometry args={[0.28, 0.2, 0.5]} />
        <meshStandardMaterial color="#f2c14e" roughness={0.5} flatShading />
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
        <meshStandardMaterial color="#2f7fc1" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 1.62, -0.24]}>
        <icosahedronGeometry args={[0.17, 1]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.3} flatShading />
      </mesh>
    </group>
  );
}
