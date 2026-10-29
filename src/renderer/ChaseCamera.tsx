import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { type Camera, PerspectiveCamera } from "three";
import type { GameSession } from "@/game/session";
import { PLAYER, type AttackKind, type RaceEvent, type RiderOrCop } from "@/race";
import type { CameraShake } from "./camera-shake";
import type { RiderMotion } from "./rider-motion";

/** Where the camera sits relative to the player: metres behind along the track, above the road, and the look-ahead. */
interface Framing {
  readonly behind: number;
  readonly above: number;
  readonly lookAhead: number;
}

/** Behind and slightly above the rider while racing. */
const CHASE: Framing = { behind: 7, above: 2.6, lookAhead: 14 };
/** Further back and higher on the title screen, so the bike and the start line show below the title. */
const TITLE: Framing = { behind: 17, above: 6.5, lookAhead: 30 };

/** Degrees of vertical field of view when standing still... */
const FIELD_OF_VIEW = 64;
/** ...and how many more at full speed. */
const FIELD_OF_VIEW_AT_SPEED = 13;
/** Metres per second at which the field of view is widest: 225 km/h. */
const FULL_SPEED = 62.5;
/** How quickly the field of view follows the speed (1/s). */
const FIELD_OF_VIEW_RESPONSE = 3;
/** The camera rolls with this share of the bike's lean. */
const TILT = 0.32;
/** Above this speed (m/s, about 160 km/h) the road starts to rumble the camera... */
const RUMBLE_SPEED = 45;
/** ...up to this much trauma at full speed. */
const RUMBLE = 0.32;
/** Riding off the road at speed rattles the camera this hard. */
const OFF_ROAD_RUMBLE = 0.55;
/** The player's crash jolts the camera this hard... */
const CRASH_JOLT = 0.85;
/** ...a car knocking them down this hard... */
const KNOCKED_DOWN_JOLT = 0.7;
/** ...a hit they take this hard, by the attack that hit them... */
const HIT_JOLTS: Record<AttackKind, number> = { punch: 0.45, kick: 0.35, "club-swing": 0.6 };
/** ...and a hit they land this hard. */
const LANDED_JOLT = 0.15;

/**
 * Follows the player from behind and slightly above, looking up the road. The
 * field of view widens with speed and the camera tilts with the bike's lean;
 * the road rumbles it at speed and off the road, unless motion is reduced.
 */
export function ChaseCamera({
  session,
  player,
  shake,
  reduceMotion,
}: {
  session: GameSession;
  /** The player's motion, already updated this frame. */
  player: RiderMotion;
  shake: CameraShake;
  reduceMotion: boolean;
}) {
  useFrame(({ camera }, delta) => aim(camera, session, player, shake, reduceMotion, delta), -1);
  useEffect(() => session.onRaceEvent((event) => shake.kick(jolt(event))), [session, shake]);
  return null;
}

/**
 * How hard a race event jolts the camera (0 to 1): the player's crashes, the
 * cars that knock them down and the hits they take, hardest; the hits they
 * land, a little.
 */
function jolt(event: RaceEvent): number {
  const isPlayer = (who: RiderOrCop) => who.kind === "rider" && who.id === PLAYER;
  if (event.type === "crash") return event.rider === PLAYER ? CRASH_JOLT : 0;
  if (event.type === "knocked-down") return event.rider === PLAYER ? KNOCKED_DOWN_JOLT : 0;
  if (event.type !== "attack-landed") return 0;
  if (isPlayer(event.target)) return HIT_JOLTS[event.kind];
  return isPlayer(event.attacker) ? LANDED_JOLT : 0;
}

function aim(
  camera: Camera,
  session: GameSession,
  player: RiderMotion,
  shake: CameraShake,
  reduceMotion: boolean,
  delta: number,
) {
  const { track } = session.view;
  const { screen } = session.getState();
  // In a race, paused or not, and on its results; every menu shows the title view.
  const racing = screen === "racing" || screen === "paused" || screen === "results";
  const framing = racing ? CHASE : TITLE;
  const { distance, offset, speed } = player.pose;

  const rumble = speed > RUMBLE_SPEED ? (RUMBLE * (speed - RUMBLE_SPEED)) / (FULL_SPEED - RUMBLE_SPEED) : 0;
  const offRoad = player.offRoad && speed > 8 ? OFF_ROAD_RUMBLE : 0;
  shake.update(screen === "paused" ? 0 : delta, racing ? Math.max(rumble, offRoad) : 0, reduceMotion || screen === "paused");

  const eye = track.pointAt(distance - framing.behind, offset * 0.85);
  const target = track.pointAt(distance + framing.lookAhead, offset * 0.9);
  camera.position.set(eye.x, eye.y + framing.above, eye.z);
  camera.lookAt(target.x, target.y + 1.1, target.z);
  // Shake in the camera's own frame: sideways, up, and a little roll.
  camera.translateX(shake.offset.x);
  camera.translateY(shake.offset.y);
  camera.rotateZ(-player.lean * (racing ? TILT : 0) + shake.offset.roll);

  if (camera instanceof PerspectiveCamera) {
    const share = racing ? Math.min(1, speed / FULL_SPEED) : 0;
    const wanted = FIELD_OF_VIEW + FIELD_OF_VIEW_AT_SPEED * share * share;
    const fov = camera.fov + (wanted - camera.fov) * (1 - Math.exp(-FIELD_OF_VIEW_RESPONSE * delta));
    if (Math.abs(fov - camera.fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}
