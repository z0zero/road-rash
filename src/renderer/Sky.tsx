import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BackSide, type Mesh, type ShaderMaterial, type ShaderMaterialParameters, Vector2, type Vector3 } from "three";
import { groundDirection } from "./geography";
import { STOP_NAN_GLSL, SUNSET, sunsetSkyGlsl } from "./sunset";

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // On the far plane, whatever the dome's size: it is drawn behind everything else.
    gl_Position = clip.xyww;
    gl_Position.z *= 0.99999;
  }
`;

function fragmentShader(sun: Vector3) {
  return /* glsl */ `
    uniform vec3 haze;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform vec2 inland;
    uniform float time;
    varying vec3 vDirection;

    ${sunsetSkyGlsl(sun)}

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    float fbm(vec2 p) {
      float total = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 4; i++) {
        total += amplitude * noise(p);
        p = p * 2.03 + vec2(17.1, 9.7);
        amplitude *= 0.5;
      }
      return total;
    }

    /** A ridge line on the horizon, as the sine of its elevation, along a horizontal direction. */
    float ridge(vec2 around, float scale, float seed) {
      return fbm(around * scale + seed);
    }

    void main() {
      vec3 direction = normalize(vDirection);
      float up = direction.y;
      float towardsSun = max(dot(direction, sunDirection), 0.0);

      vec3 color = sunsetSky(direction);

      // Streaks of cloud on a high, flat layer, lit from below by the low sun.
      if (up > 0.015) {
        vec2 layer = direction.xz / (up + 0.04) * 1.6 + vec2(time * 0.004, 0.0);
        float cloud = fbm(layer * vec2(0.55, 2.4));
        cloud = smoothstep(0.52, 0.78, cloud) * smoothstep(0.015, 0.09, up) * (1.0 - smoothstep(0.35, 0.6, up));
        vec3 shade = mix(vec3(0.33, 0.17, 0.32), vec3(1.25, 0.55, 0.36), pow(towardsSun, 3.0));
        shade += vec3(1.4, 0.75, 0.35) * pow(towardsSun, 24.0);
        color = mix(color, shade, cloud * 0.85);
      }

      // Hazy mountains far inland, behind the cliffs.
      vec2 around = normalize(direction.xz + 1e-5);
      float inlandness = smoothstep(0.35, 0.8, dot(around, inland));
      if (inlandness > 0.0) {
        float far = (0.01 + 0.09 * pow(ridge(around, 3.0, 4.0), 1.6)) * inlandness;
        float near = (0.004 + 0.06 * pow(ridge(around, 5.5, 11.0), 1.8)) * inlandness;
        vec3 farColor = mix(sunsetHaze(haze, direction), vec3(0.42, 0.23, 0.36), 0.38);
        vec3 nearColor = mix(sunsetHaze(haze, direction), vec3(0.22, 0.12, 0.22), 0.55);
        color = mix(color, farColor, smoothstep(far + 0.002, far - 0.002, up));
        color = mix(color, nearColor, smoothstep(near + 0.002, near - 0.002, up));
      }

      // The sun's disc and a bright halo: far brighter than white, so they bloom.
      float disc = smoothstep(0.99955, 0.99968, dot(direction, sunDirection));
      color += sunColor * (disc * 20.0 + pow(towardsSun, 1800.0) * 2.0);

      gl_FragColor = vec4(color, 1.0);
      ${STOP_NAN_GLSL}
    }
  `;
}

/**
 * The sunset sky: a dome that travels with the camera, with a gradient from
 * deep violet overhead to the glowing haze at the horizon, the low sun, streaky
 * clouds and hazy hills inland. It matches the fog at the horizon.
 */
export function Sky({ sun, seaHeading }: { sun: Vector3; seaHeading: number }) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<ShaderMaterial>(null);
  const parameters = useMemo<ShaderMaterialParameters>(
    () => ({
      vertexShader,
      fragmentShader: fragmentShader(sun),
      uniforms: {
        haze: { value: SUNSET.haze },
        sunColor: { value: SUNSET.sun },
        sunDirection: { value: sun },
        inland: { value: inlandDirection(seaHeading) },
        time: { value: 0 },
      },
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
    [sun, seaHeading],
  );

  useFrame(({ camera, clock }) => {
    mesh.current?.position.copy(camera.position);
    if (material.current) material.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[100, 48, 24]} />
      <shaderMaterial ref={material} args={[parameters]} />
    </mesh>
  );
}

/** Straight inland, the opposite of out to sea, as (x, z). */
function inlandDirection(seaHeading: number) {
  const outToSea = groundDirection(seaHeading);
  return new Vector2(-outToSea.x, -outToSea.z);
}
