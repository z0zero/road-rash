import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo } from "react";
import type { GameSession } from "@/game/session";
import { smoothstep } from "@/math";
import { ColorGradeEffect, SpeedBlurEffect, SpeedLinesEffect } from "./effects";
import type { RiderMotion } from "./rider-motion";

/** Metres per second: speed lines start to show at about 160 km/h... */
const SPEED_LINES_FROM = 44;
/** ...and motion blur at about 110 km/h... */
const SPEED_BLUR_FROM = 30;
/** ...both at their strongest at 225 km/h. */
const FULL_SPEED = 62.5;

/**
 * The finish on every frame: bloom on the sun and everything that glows,
 * filmic tone mapping, a sunset colour grade and a soft vignette, plus motion
 * blur and speed lines at high speed unless motion is reduced.
 */
export function PostProcessing({
  session,
  player,
  reduceMotion,
  multisampling,
}: {
  session: GameSession;
  player: RiderMotion;
  reduceMotion: boolean;
  multisampling: number;
}) {
  const effects = useMemo(
    () => ({ grade: new ColorGradeEffect(), lines: new SpeedLinesEffect(), blur: new SpeedBlurEffect() }),
    [],
  );
  useEffect(() => () => Object.values(effects).forEach((effect) => effect.dispose()), [effects]);

  useFrame(() => driveSpeedEffects(effects, session, player));

  return (
    <EffectComposer multisampling={multisampling}>
      {/* Blur first: it reads the frame as drawn, before the other effects change it. */}
      {!reduceMotion && <primitive object={effects.blur} dispose={null} />}
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.3} intensity={0.7} radius={0.65} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={effects.grade} dispose={null} />
      <Vignette offset={0.3} darkness={0.6} />
      {!reduceMotion && <primitive object={effects.lines} dispose={null} />}
    </EffectComposer>
  );
}

/** Sets the speed lines and motion blur from the player's speed; none while not racing. */
function driveSpeedEffects(
  { lines, blur }: { lines: SpeedLinesEffect; blur: SpeedBlurEffect },
  session: GameSession,
  player: RiderMotion,
) {
  const racing = session.getState().screen === "racing";
  const speed = racing ? player.pose.speed : 0;
  lines.setStrength(smoothstep(SPEED_LINES_FROM, FULL_SPEED, speed));
  blur.setStrength(smoothstep(SPEED_BLUR_FROM, FULL_SPEED, speed));
}
