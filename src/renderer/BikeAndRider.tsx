import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Group, Quaternion, Vector3 } from "three";
import type { GameSession } from "@/game/session";
import type { Livery } from "./liveries";
import { hipsHeight, poseAttack, poseClub, poseRun, poseTumble, restJoints } from "./rider-animation";
import type { BikeMotion } from "./rider-motion";
import { createRiderModel, flashLightBar, type RiderModel, WHEEL_RADIUS } from "./rider-model";

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
/** A bike lying on its side rolls this far over (radians)... */
const LYING = Math.PI / 2 - 0.2;
/** ...and rests this high on its side (metres). */
const LYING_HEIGHT = 0.24;

/**
 * One rider, or cop, on their bike, in their own livery: the flat-shaded
 * model built in code, placed from the interpolated snapshots, its wheels
 * turning, leaning into corners with the rider hanging off the inside and
 * tucking in at speed, punching and kicking, and holding and swinging a club
 * if they have one. After a crash the rider drops any club and leaves the
 * bike, which falls on its side and slides to a stop: they tumble along the
 * road, then get up and run back to it. A cop's bike is a `police` bike, its
 * light bar flashing red and blue while they ride in the race. It updates
 * `motion` first each frame, so whatever follows this rider (the camera
 * follows the player) reads it fresh.
 */
export function BikeAndRider({
  session,
  motion,
  livery,
  police = false,
}: {
  session: GameSession;
  motion: BikeMotion;
  livery: Livery;
  police?: boolean;
}) {
  const model = useMemo(() => createRiderModel(livery, { police }), [livery, police]);
  // Where the rider is on their own after a crash; while they ride, the model's rider sits on the bike.
  const body = useMemo(() => ({ group: new Group(), seat: model.rider.position.clone() }), [model]);
  useEffect(() => () => model.dispose(), [model]);

  useFrame((_, delta) => {
    motion.update(session.view, delta, WHEEL_RADIUS);
    restJoints(model);
    if (motion.crash) poseCrashed(model, body, motion);
    else poseRiding(model, body, motion);
    if (model.lightBar) flashLightBar(model.lightBar, motion.lightsFlashing, session.view.current.clock);
  }, -2);

  return (
    <>
      <primitive object={model.root} />
      <primitive object={body.group} />
    </>
  );
}

const ACROSS = new Vector3(1, 0, 0);
const tuck = new Quaternion();

/** Puts the model where the motion says, leaning, with its wheels turned, its rider hanging off and attacking. */
function poseRiding(model: RiderModel, body: { group: Group; seat: Vector3 }, motion: BikeMotion) {
  const { root, wheels, rider, torso, head, rest } = model;
  if (rider.parent !== root) {
    root.add(rider);
    rider.rotation.set(0, 0, 0);
  }
  rider.position.copy(body.seat);
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
  if (motion.attack) poseAttack(model, motion.attack);
  poseClub(model, motion.weapon === "club", motion.clubHand, motion.attack);
}

/** Lays the bike on its side where it slid to, and puts the rider on their own: tumbling, or on foot. */
function poseCrashed(model: RiderModel, body: { group: Group; seat: Vector3 }, motion: BikeMotion) {
  const { root, wheels, rider } = model;
  const roll = motion.fallSide * LYING * motion.fallen;
  root.position.set(motion.x, motion.y + LYING_HEIGHT * motion.fallen, motion.z);
  root.rotation.set(motion.pitch, motion.yaw, -(roll + motion.bank), "YXZ");
  for (const wheel of wheels) wheel.rotation.x = -motion.wheelTurn;

  if (rider.parent !== body.group) body.group.add(rider);
  // A rider who crashes drops their club.
  poseClub(model, false, motion.clubHand, null);
  const tumbling = motion.crash === "tumbling";
  body.group.position.set(motion.bodyX, motion.bodyY, motion.bodyZ);
  body.group.rotation.set(0, motion.bodyYaw, 0);
  rider.position.set(0, hipsHeight(tumbling, motion.tumble), 0);
  if (tumbling) {
    // Rolling head over heels along the road, twisting a little as they go.
    rider.rotation.set(-motion.tumble, 0, 0.5 * Math.sin(motion.tumble * 0.45), "XYZ");
    poseTumble(model, 0.85);
  } else {
    rider.rotation.set(0, 0, 0);
    poseRun(model, motion.stride, Math.hypot(motion.pose.speed, motion.pose.sideways));
  }
}
