import { Color, ShaderChunk, Vector3 } from "three";
import { radians } from "@/math";
import { groundDirection } from "./geography";

/**
 * The look of the sunset: its colours, where the sun hangs, and the haze that
 * fades distant things into the sky. The sky, the fog, the sea and the lights
 * all take their colours from here, so they agree at the horizon.
 */
export const SUNSET = {
  /** The sky straight up. */
  zenith: new Color("#1f1747"),
  /** The sky high above the horizon. */
  upperSky: new Color("#5f3a7d"),
  /** The sky just above the horizon haze. */
  lowerSky: new Color("#f08a63"),
  /** The haze at the horizon, and the fog colour, away from the sun. */
  haze: new Color("#f3a27e"),
  /** Added to the haze, the sky and the fog towards the sun. */
  glow: new Color("#ffad4a"),
  /** The sun's disc, many times brighter than white so it blooms. */
  sun: new Color("#fff0c4"),
  /** The sunlight falling on the world. */
  sunlight: new Color("#ffc08a"),
  /** Light from the sky above and bounced off the ground below. */
  skylight: new Color("#ffc7a6"),
  groundLight: new Color("#5a3f62"),
  /** Deep water, and its glints. */
  sea: new Color("#14476a"),
  seaShallow: new Color("#1f6f86"),
} as const;

/** The sun hangs this far round from straight out to sea, towards the right of the sea (radians)... */
const SUN_AROUND_FROM_SEA = radians(55);
/** ...and this high above the horizon (radians). */
const SUN_ELEVATION = radians(7);
/** The sunlight comes from higher than the sun's disc, so the low sun still lights the road. */
const SUNLIGHT_ELEVATION = radians(24);

/**
 * The direction towards the sun, as a unit vector in world coordinates, for a
 * coast whose sea lies at compass heading `seaHeading` (see `Track`): low over
 * the sea, ahead and to the left of a rider who has the sea on the left.
 */
export function sunDirection(seaHeading: number, elevation = SUN_ELEVATION): Vector3 {
  const towards = groundDirection(seaHeading + SUN_AROUND_FROM_SEA);
  return new Vector3(towards.x * Math.cos(elevation), Math.sin(elevation), towards.z * Math.cos(elevation));
}

/** The direction the sunlight comes from: the sun's direction, raised. */
export function sunlightDirection(seaHeading: number): Vector3 {
  return sunDirection(seaHeading, SUNLIGHT_ELEVATION);
}

const glsl = (value: number) => value.toFixed(5);
const vec3 = (v: { x: number; y: number; z: number }) => `vec3(${glsl(v.x)}, ${glsl(v.y)}, ${glsl(v.z)})`;
const rgb = (c: Color) => `vec3(${glsl(c.r)}, ${glsl(c.g)}, ${glsl(c.b)})`;

/**
 * GLSL for `vec3 sunsetHaze(vec3 base, vec3 direction)`: the haze seen
 * looking along a world-space `direction`, brightening towards the sun.
 */
export function sunsetHazeGlsl(sun: Vector3): string {
  return /* glsl */ `
    vec3 sunsetHaze(vec3 base, vec3 direction) {
      float towardsSun = max(dot(normalize(direction), ${vec3(sun)}), 0.0);
      return base + ${rgb(SUNSET.glow)} * (0.38 * pow(towardsSun, 5.0) + 0.9 * pow(towardsSun, 40.0));
    }
  `;
}

/**
 * GLSL that draws a fragment whose colour came out as not-a-number or
 * infinite black instead. One such pixel is invisible on its own, but bloom
 * would smear it across the whole frame and black it out. It tests the bits,
 * which no compiler can assume away.
 */
export const STOP_NAN_GLSL = /* glsl */ `
  if (any(equal(floatBitsToUint(gl_FragColor.rgb) & 0x7f800000u, uvec3(0x7f800000u)))) gl_FragColor.rgb = vec3(0.0);
`;

/**
 * GLSL for `sunsetHaze` (see `sunsetHazeGlsl`) and for `vec3 sunsetSky(vec3
 * direction)`: the bare sky seen looking along a world-space `direction`, from
 * deep violet overhead down through the sunset to the haze at the horizon,
 * glowing towards the sun, without its clouds, hills or the sun itself.
 */
export function sunsetSkyGlsl(sun: Vector3): string {
  return /* glsl */ `
    ${sunsetHazeGlsl(sun)}
    vec3 sunsetSky(vec3 direction) {
      vec3 towards = normalize(direction);
      float up = towards.y;
      vec3 sky = mix(${rgb(SUNSET.lowerSky)}, ${rgb(SUNSET.upperSky)}, smoothstep(0.03, 0.32, up));
      sky = mix(sky, ${rgb(SUNSET.zenith)}, smoothstep(0.3, 0.95, up));
      sky = sunsetHaze(sky, towards);
      return mix(sunsetHaze(${rgb(SUNSET.haze)}, towards), sky, smoothstep(0.0, 0.14, up));
    }
  `;
}

let installedFor: string | null = null;

/**
 * Makes three.js's fog glow towards the sun, so fogged land and sea fade into
 * the sky's own horizon in every direction. The fog's colour is the base
 * haze, with the glow added along each fragment's view direction; towards the
 * fog's far end it gives way to the sky behind, so the furthest land, even
 * where it stands above the horizon, fades into the sky and leaves no edge
 * where the draw distance cuts it off. The fog comes last in every fogged
 * material, everything but the sky, so it also stops any not-a-number colour
 * there (see `STOP_NAN_GLSL`). Call it before the first frame is drawn;
 * calling it again with the same sun does nothing.
 */
export function installSunsetHaze(sun: Vector3) {
  const key = vec3(sun);
  if (installedFor === key) return;
  installedFor = key;
  ShaderChunk.fog_pars_vertex = /* glsl */ `
    #ifdef USE_FOG
      varying float vFogDepth;
      varying vec3 vFogDirection;
    #endif
  `;
  ShaderChunk.fog_vertex = /* glsl */ `
    #ifdef USE_FOG
      vFogDepth = - mvPosition.z;
      // From view space back to world space: the view matrix's rotation, transposed.
      vFogDirection = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
    #endif
  `;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
    #ifdef USE_FOG
      uniform vec3 fogColor;
      varying float vFogDepth;
      varying vec3 vFogDirection;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
      #endif
      ${sunsetSkyGlsl(sun)}
    #endif
  `;
  ShaderChunk.fog_fragment = /* glsl */ `
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      float skyward = smoothstep( 0.6, 1.0, fogFactor );
      vec3 hazed = mix( sunsetHaze( fogColor, vFogDirection ), sunsetSky( vFogDirection ), skyward );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, hazed, fogFactor );
      ${STOP_NAN_GLSL}
    #endif
  `;
}
