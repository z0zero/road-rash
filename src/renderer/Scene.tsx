import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { type Camera, PerspectiveCamera, type WebGLRenderer } from "three";
import type { GameSession } from "@/game/session";
import { PLAYER } from "@/race";
import { BikeAndRider } from "./BikeAndRider";
import { CameraShake } from "./camera-shake";
import { ChaseCamera, FIELD_OF_VIEW_DEGREES } from "./ChaseCamera";
import { drawnTrack } from "./drawn-track";
import { Obstacles } from "./Obstacles";
import { PostProcessing } from "./PostProcessing";
import {
  frameRateBounds,
  isSoftwareRenderer,
  LOWEST_QUALITY,
  pixelRatio,
  QUALITY_LEVELS,
  QualityRetries,
} from "./quality";
import { COP_LIVERY, liveryOf } from "./liveries";
import { CopMotion, RiderMotion } from "./rider-motion";
import { Scenery } from "./Scenery";
import { Sea } from "./Sea";
import { Sky } from "./Sky";
import { Sunlight } from "./Sunlight";
import { installSunsetHaze, SUNSET, sunDirection, sunlightDirection } from "./sunset";
import { Terrain } from "./Terrain";
import { TrackModel } from "./TrackModel";
import { Traffic } from "./Traffic";

/**
 * The 3D view of the race: the sunset coast, the road with its scenery and
 * obstacles, the traffic, every rider and cop on their bike and the chase
 * camera behind the player, finished with post-processing. It draws whatever the
 * session's view holds and holds no game rules. Rendering is driven by the
 * game loop (frameloop "never" plus `advance`), right after the race has been
 * stepped. A performance monitor lowers the quality when the frame rate drops,
 * and raises it again when there is room to spare.
 */
export function Scene({ session, reduceMotion }: { session: GameSession; reduceMotion: boolean }) {
  const track = session.view.track;
  const drawn = useMemo(() => drawnTrack(track), [track]);
  const { sun, sunlight } = useMemo(() => {
    const sun = sunDirection(track.seaHeading);
    // Before anything is drawn, so every fogged material is built with the sunset haze.
    installSunsetHaze(sun);
    return { sun, sunlight: sunlightDirection(track.seaHeading) };
  }, [track.seaHeading]);
  // One motion per rider (riders are numbered from 0, the player); the camera and the speed effects follow the player's.
  const riders = session.view.current.riders.length;
  const motions = useMemo(() => Array.from({ length: riders }, (_, id) => new RiderMotion(id)), [riders]);
  const player = motions[PLAYER];
  // And one per cop.
  const cops = session.view.current.cops.length;
  const copMotions = useMemo(() => Array.from({ length: cops }, (_, id) => new CopMotion(id)), [cops]);
  const shake = useMemo(() => new CameraShake(), []);
  const [devicePixelRatio] = useState(() => window.devicePixelRatio);
  const [level, setLevel] = useState(0);
  const retries = useMemo(() => new QualityRetries(), []);
  const [software, setSoftware] = useState(false);
  const quality = QUALITY_LEVELS[level];

  return (
    <div className="absolute inset-0">
      <Canvas
        frameloop="never"
        dpr={pixelRatio(quality, devicePixelRatio)}
        shadows="percentage"
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: FIELD_OF_VIEW_DEGREES, near: 1, far: quality.drawDistance + 100 }}
        onCreated={({ gl }) => {
          // A software renderer has no GPU to spare: start at the cheapest quality.
          if (isSoftwareRenderer(rendererName(gl))) {
            setSoftware(true);
            setLevel(LOWEST_QUALITY);
          }
        }}
      >
        {/* Its callbacks come from the frame loop, but only on the rare frames the quality changes. */}
        <PerformanceMonitor
          bounds={frameRateBounds}
          onDecline={() => {
            if (level === LOWEST_QUALITY) return;
            retries.tooSlow(level, performance.now() / 1000);
            setLevel(level + 1);
          }}
          onIncline={() => {
            // A software renderer stays at the cheapest level: it has no GPU to spare for more.
            if (software || level === 0 || !retries.mayTry(level - 1, performance.now() / 1000)) return;
            setLevel(level - 1);
          }}
        />
        <DrawDistance metres={quality.drawDistance} />
        <fog attach="fog" args={[SUNSET.haze, quality.drawDistance * 0.12, quality.drawDistance]} />
        <hemisphereLight args={[SUNSET.skylight, SUNSET.groundLight, 1.1]} />
        <Sunlight direction={sunlight} player={player} shadows={quality.shadows} />
        <Sky sun={sun} seaHeading={track.seaHeading} />
        <Sea sun={sun} />
        <TrackModel track={drawn} />
        <Terrain track={drawn} />
        <Scenery track={drawn} />
        <Obstacles track={drawn} />
        <Traffic session={session} />
        {motions.map((motion) => (
          <BikeAndRider key={motion.rider} session={session} motion={motion} livery={liveryOf(motion.rider)} />
        ))}
        {copMotions.map((motion) => (
          <BikeAndRider key={`cop-${motion.cop}`} session={session} motion={motion} livery={COP_LIVERY} cop />
        ))}
        <ChaseCamera session={session} player={player} shake={shake} reduceMotion={reduceMotion} />
        <PostProcessing session={session} player={player} reduceMotion={reduceMotion} multisampling={software ? 0 : 4} />
      </Canvas>
    </div>
  );
}

/** Keeps the camera's far plane just beyond the fog, so nothing past it is drawn. */
function DrawDistance({ metres }: { metres: number }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => setFarPlane(camera, metres + 100), [camera, metres]);
  return null;
}

function setFarPlane(camera: Camera, far: number) {
  if (!(camera instanceof PerspectiveCamera)) return;
  camera.far = far;
  camera.updateProjectionMatrix();
}

/** The name of the GPU, or of the software that stands in for one. */
function rendererName(gl: WebGLRenderer): string {
  const context = gl.getContext();
  const named = String(context.getParameter(context.RENDERER));
  if (!/^webkit webgl$/i.test(named)) return named;
  const info = context.getExtension("WEBGL_debug_renderer_info");
  return info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : named;
}
