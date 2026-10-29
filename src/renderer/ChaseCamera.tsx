import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { GameSession } from "@/game/session";
import { PLAYER } from "@/race";
import { createPose, poseOf } from "./rider-pose";

/** Where the camera sits relative to the player: metres behind along the track, above the road, and the look-ahead. */
interface Framing {
  readonly behind: number;
  readonly above: number;
  readonly lookAhead: number;
}

/** Behind and slightly above the rider while racing. */
const CHASE: Framing = { behind: 7, above: 2.7, lookAhead: 14 };
/** Further back and higher on the title screen, so the bike and the start line show below the title. */
const TITLE: Framing = { behind: 17, above: 6.5, lookAhead: 30 };

/** Follows the player from behind and slightly above, looking up the road. */
export function ChaseCamera({ session }: { session: GameSession }) {
  const pose = useRef(createPose());

  useFrame(({ camera }) => {
    const view = session.view;
    const framing = session.getState().screen === "title" ? TITLE : CHASE;
    const { distance, offset } = poseOf(view, PLAYER, pose.current);
    const eye = view.track.pointAt(distance - framing.behind, offset * 0.85);
    const target = view.track.pointAt(distance + framing.lookAhead, offset * 0.9);
    camera.position.set(eye.x, eye.y + framing.above, eye.z);
    camera.lookAt(target.x, target.y + 1.1, target.z);
  });

  return null;
}
