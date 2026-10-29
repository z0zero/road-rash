import { Canvas } from "@react-three/fiber";
import type { GameSession } from "@/game/session";
import { BikeAndRider } from "./BikeAndRider";
import { ChaseCamera } from "./ChaseCamera";
import { TrackModel } from "./TrackModel";

const SKY = "#f0a676";

/**
 * The 3D view of the race. It draws whatever the session's view holds and
 * holds no game rules. Rendering is driven by the game loop (frameloop
 * "never" plus `advance`), right after the race has been stepped.
 */
export function Scene({ session }: { session: GameSession }) {
  return (
    <div className="absolute inset-0">
      <Canvas frameloop="never" dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov: 68, near: 0.3, far: 3000 }}>
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 160, 1100]} />
        <hemisphereLight args={["#ffe3c2", "#3b4a63", 1.2]} />
        {/* A low sun in the west, over the sea. */}
        <directionalLight position={[-500, 140, 120]} intensity={2} color="#ffcf9a" />
        <TrackModel track={session.view.track} />
        <BikeAndRider session={session} />
        <ChaseCamera session={session} />
      </Canvas>
    </div>
  );
}
