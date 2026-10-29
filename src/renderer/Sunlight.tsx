import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { DirectionalLight, Vector3 } from "three";
import type { QualityLevel } from "./quality";
import type { RiderMotion } from "./rider-motion";
import { SUNSET } from "./sunset";

/** Metres from the player to the light, along the sunlight. */
const LIGHT_DISTANCE = 150;

const SHADOWS = {
  high: { mapSize: 2048, reach: 34 },
  low: { mapSize: 1024, reach: 22 },
} as const;

/**
 * The low sun's light, casting long shadows across the road around the
 * player. It travels with the player, so its shadow map covers what the
 * camera sees up close.
 */
export function Sunlight({
  direction,
  player,
  shadows,
}: {
  /** Towards the sun, as a unit vector. */
  direction: Vector3;
  player: RiderMotion;
  shadows: QualityLevel["shadows"];
}) {
  const light = useRef<DirectionalLight>(null);
  useFrame(() => {
    if (light.current) followPlayer(light.current, direction, player);
  });
  const shadow = shadows === "off" ? null : SHADOWS[shadows];
  return (
    <directionalLight
      // A new light for each shadow setting, so the shadow map is rebuilt at its new size.
      key={shadows}
      ref={light}
      intensity={2.4}
      color={SUNSET.sunlight}
      castShadow={shadow !== null}
      shadow-mapSize={[shadow?.mapSize ?? 512, shadow?.mapSize ?? 512]}
      shadow-camera-left={-(shadow?.reach ?? 10)}
      shadow-camera-right={shadow?.reach ?? 10}
      shadow-camera-top={shadow?.reach ?? 10}
      shadow-camera-bottom={-(shadow?.reach ?? 10)}
      shadow-camera-near={1}
      shadow-camera-far={LIGHT_DISTANCE * 2}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

function followPlayer(light: DirectionalLight, direction: Vector3, player: RiderMotion) {
  light.target.position.set(player.x, player.y, player.z);
  light.position.set(
    player.x + direction.x * LIGHT_DISTANCE,
    player.y + direction.y * LIGHT_DISTANCE,
    player.z + direction.z * LIGHT_DISTANCE,
  );
  light.target.updateMatrixWorld();
}
