import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import type { GameSession } from "@/game/session";
import { BikeAndRider } from "./BikeAndRider";
import { ChaseCamera } from "./ChaseCamera";
import { Sea } from "./Sea";
import { Sky } from "./Sky";
import { installSunsetHaze, SUNSET, sunDirection, sunlightDirection } from "./sunset";
import { TrackModel } from "./TrackModel";

/**
 * The 3D view of the race. It draws whatever the session's view holds and
 * holds no game rules. Rendering is driven by the game loop (frameloop
 * "never" plus `advance`), right after the race has been stepped.
 */
export function Scene({ session }: { session: GameSession }) {
  const track = session.view.track;
  const { sun, sunlight } = useMemo(() => {
    const sun = sunDirection(track.seaHeading);
    // Before anything is drawn, so every fogged material is built with the sunset haze.
    installSunsetHaze(sun);
    return { sun, sunlight: sunlightDirection(track.seaHeading).multiplyScalar(400) };
  }, [track.seaHeading]);

  return (
    <div className="absolute inset-0">
      <Canvas frameloop="never" dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov: 66, near: 1, far: 1400 }}>
        <fog attach="fog" args={[SUNSET.haze, 140, 1300]} />
        <hemisphereLight args={[SUNSET.skylight, SUNSET.groundLight, 1.1]} />
        <directionalLight position={sunlight} intensity={2.4} color={SUNSET.sunlight} />
        <Sky sun={sun} seaHeading={track.seaHeading} />
        <Sea sun={sun} />
        <TrackModel track={track} />
        <BikeAndRider session={session} />
        <ChaseCamera session={session} />
      </Canvas>
    </div>
  );
}
