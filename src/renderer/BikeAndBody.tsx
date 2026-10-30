import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { type Camera, Group, type Object3D, Quaternion, Vector3 } from "three";
import type { GameSession } from "@/game/session";
import type { Livery } from "./liveries";
import { createBikeModel, flashLightBar, type BikeModel, WHEEL_RADIUS } from "./bike-model";
import type { BikeMotion } from "./bike-motion";
import { hipsHeight, poseAttack, poseClub, poseRun, poseTumble, restJoints } from "./body-animation";

/** The bike's lean shifts the body on it this many metres towards the inside of the corner per radian... */
const HANG_OFF = 0.22;
/** ...leans their body this much further into it... */
const BODY_LEAN = 0.3;
/** ...and keeps their head this much closer to upright. */
const HEAD_LEVELLING = 0.45;
/** At full speed the body tucks in behind the screen by this many radians. */
const TUCK = 0.16;
/** Metres per second at which the body is fully tucked in. */
const TUCKED_SPEED = 55;
/** A bike lying on its side rolls this far over (radians)... */
const LYING = Math.PI / 2 - 0.2;
/** ...and rests this high on its side (metres). */
const LYING_HEIGHT = 0.24;
/**
 * A bike, or a body off it, is left undrawn while its middle, this high above
 * where it is (metres)...
 */
const MIDDLE_HEIGHT = 1;
/**
 * ...is nearer the camera than this (metres): passing right beside the camera,
 * it would fill a corner of the screen, cut by the near plane into flat shapes.
 */
const CAMERA_CLEARANCE = 3;

/**
 * One bike and the body on it, a rider's or a cop's, in their own livery: the
 * flat-shaded model built in code, placed from the interpolated snapshots,
 * its wheels turning, leaning into corners with the body hanging off the
 * inside and tucking in at speed, punching and kicking, and holding and
 * swinging a club if they have one. After a crash they drop any club and
 * leave the bike, which falls on its side and slides to a stop: they tumble
 * along the road, then get up and run back to it. A `cop`'s bike has
 * panniers, its light bar flashing red and blue while they ride in the race.
 * It updates `motion` first each frame, so whatever follows them (the camera
 * follows the player) reads it fresh.
 */
export function BikeAndBody({
  session,
  motion,
  livery,
  cop = false,
}: {
  session: GameSession;
  motion: BikeMotion;
  livery: Livery;
  cop?: boolean;
}) {
  const model = useMemo(() => createBikeModel(livery, { cop }), [livery, cop]);
  // Where the body is on its own after a crash; while they ride, it sits on the bike, in its seat.
  const offTheBike = useMemo(() => ({ group: new Group(), seat: model.body.position.clone() }), [model]);
  useEffect(() => () => model.dispose(), [model]);

  useFrame(({ camera }, delta) => {
    motion.update(session.view, delta, WHEEL_RADIUS);
    restJoints(model);
    if (motion.crash) poseCrashed(model, offTheBike, motion);
    else poseRiding(model, offTheBike, motion);
    if (model.lightBar) flashLightBar(model.lightBar, motion.lightsFlashing, session.view.current.clock);
    // The camera is where it was last frame, which is near enough.
    drawIfClearOf(camera, model.root);
    drawIfClearOf(camera, offTheBike.group);
  }, -2);

  return (
    <>
      <primitive object={model.root} />
      <primitive object={offTheBike.group} />
    </>
  );
}

const ACROSS = new Vector3(1, 0, 0);
const tuck = new Quaternion();
const middle = new Vector3();

/** Draws `object`, a bike or the body off it, only while it is clear of `camera` (see `CAMERA_CLEARANCE`). */
function drawIfClearOf(camera: Camera, object: Object3D) {
  middle.copy(object.position);
  middle.y += MIDDLE_HEIGHT;
  object.visible = middle.distanceToSquared(camera.position) > CAMERA_CLEARANCE * CAMERA_CLEARANCE;
}

/** Puts the model where the motion says, leaning, with its wheels turned, the body on it hanging off and attacking. */
function poseRiding(model: BikeModel, offTheBike: { group: Group; seat: Vector3 }, motion: BikeMotion) {
  const { root, wheels, body, torso, head, rest } = model;
  if (body.parent !== root) {
    root.add(body);
    body.rotation.set(0, 0, 0);
  }
  body.position.copy(offTheBike.seat);
  root.position.copy(motion.bikeAt);
  root.rotation.set(motion.pitch, motion.yaw, -(motion.lean + motion.bank), "YXZ");
  for (const wheel of wheels) wheel.rotation.x = -motion.wheelTurn;
  body.position.x = -motion.lean * HANG_OFF;
  body.rotation.z = -motion.lean * BODY_LEAN;
  head.rotation.z = motion.lean * (1 + BODY_LEAN) * HEAD_LEVELLING;
  const restTorso = rest.get(torso);
  if (restTorso) {
    tuck.setFromAxisAngle(ACROSS, -TUCK * Math.min(1, motion.pose.speed / TUCKED_SPEED));
    torso.quaternion.copy(tuck).multiply(restTorso);
  }
  if (motion.attack) poseAttack(model, motion.attack);
  poseClub(model, motion);
}

/** Lays the bike on its side where it slid to, and puts the body on its own: tumbling, or on foot. */
function poseCrashed(model: BikeModel, offTheBike: { group: Group; seat: Vector3 }, motion: BikeMotion) {
  const { root, wheels, body } = model;
  const roll = motion.fallSide * LYING * motion.fallen;
  root.position.copy(motion.bikeAt);
  root.position.y += LYING_HEIGHT * motion.fallen;
  root.rotation.set(motion.pitch, motion.yaw, -(roll + motion.bank), "YXZ");
  for (const wheel of wheels) wheel.rotation.x = -motion.wheelTurn;

  if (body.parent !== offTheBike.group) offTheBike.group.add(body);
  // Whatever the race says they still hold: anyone who comes off their bike has dropped their club.
  poseClub(model, motion);
  // Tumbling, after a crash or a knock-down, until they are on foot.
  const tumbling = motion.crash !== "on-foot";
  offTheBike.group.position.copy(motion.bodyAt);
  offTheBike.group.rotation.set(0, motion.bodyYaw, 0);
  body.position.set(0, hipsHeight(tumbling, motion.tumble), 0);
  if (tumbling) {
    // Rolling head over heels along the road, twisting a little as they go.
    body.rotation.set(-motion.tumble, 0, 0.5 * Math.sin(motion.tumble * 0.45), "XYZ");
    poseTumble(model, 0.85);
  } else {
    body.rotation.set(0, 0, 0);
    poseRun(model, motion.stride, Math.hypot(motion.pose.speed, motion.pose.sideways));
  }
}
