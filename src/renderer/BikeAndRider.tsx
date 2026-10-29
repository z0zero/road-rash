import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import type { GameSession } from "@/game/session";
import { liveryOf } from "./liveries";
import type { RiderMotion } from "./rider-motion";
import { createRiderModel, type RiderModel, WHEEL_RADIUS } from "./rider-model";

/** The bike's lean shifts the rider this many metres towards the inside of the corner per radian... */
const HANG_OFF = 0.22;
/** ...leans their body this much further into it... */
const BODY_LEAN = 0.3;
/** ...and keeps their head this much closer to upright. */
const HEAD_LEVELLING = 0.45;
/** At full speed the rider tucks in behind the screen by this many radians. */
const TUCK = 0.16;
/** Metres per second at which the rider is fully tucked in. */
const TUCKED_SPEED = 55;

/**
 * One rider on their bike, in the rider's own livery: the flat-shaded model
 * built in code, placed from the interpolated snapshots, its wheels turning,
 * leaning into corners with the rider hanging off the inside and tucking in
 * at speed. It updates `motion` first each frame, so whatever follows this
 * rider (the camera follows the player) reads it fresh.
 */
export function BikeAndRider({ session, motion }: { session: GameSession; motion: RiderMotion }) {
  const model = useMemo(() => createRiderModel(liveryOf(motion.rider)), [motion]);
  useEffect(() => () => model.dispose(), [model]);

  useFrame((_, delta) => {
    motion.update(session.view, delta, WHEEL_RADIUS);
    poseModel(model, motion);
  }, -2);

  return <primitive object={model.root} />;
}

const ACROSS = new Vector3(1, 0, 0);
const tuck = new Quaternion();

/** Puts the model where the motion says, leaning, with its wheels turned and its rider hanging off. */
function poseModel(model: RiderModel, motion: RiderMotion) {
  const { root, wheels, rider, torso, head, rest } = model;
  root.position.set(motion.x, motion.y, motion.z);
  root.rotation.set(motion.pitch, motion.yaw, -(motion.lean + motion.bank), "YXZ");
  for (const wheel of wheels) wheel.rotation.x = -motion.wheelTurn;
  rider.position.x = -motion.lean * HANG_OFF;
  rider.rotation.z = -motion.lean * BODY_LEAN;
  head.rotation.z = motion.lean * (1 + BODY_LEAN) * HEAD_LEVELLING;
  const restTorso = rest.get(torso);
  if (restTorso) {
    tuck.setFromAxisAngle(ACROSS, -TUCK * Math.min(1, motion.pose.speed / TUCKED_SPEED));
    torso.quaternion.copy(tuck).multiply(restTorso);
  }
}
