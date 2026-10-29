import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  type Mesh,
  type ShaderMaterial,
  type ShaderMaterialParameters,
  UniformsLib,
  UniformsUtils,
  type Vector3,
} from "three";
import { SUNSET } from "./sunset";

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float time;
  uniform vec3 deep;
  uniform vec3 shallow;
  uniform vec3 skyColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  varying vec3 vWorldPosition;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  /** A tilt for the facet of a triangular lattice that contains p, rocking slowly with the swell. */
  vec2 facetTilt(vec2 p) {
    const float size = 10.0;
    // Skew into a lattice of equilateral triangles: two per skewed square cell.
    vec2 skewed = vec2(p.x + p.y * 0.57735, p.y * 1.1547) / size;
    vec2 cell = floor(skewed);
    vec2 within = fract(skewed);
    vec2 id = cell * 2.0 + (within.x > within.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    vec2 random = hash2(id);
    float angle = random.x * 6.2831 + time * (0.25 + random.y * 0.35);
    return vec2(cos(angle), sin(angle)) * (0.025 + 0.045 * random.y);
  }

  void main() {
    vec3 toEye = cameraPosition - vWorldPosition;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    // Far away the facets shrink below a pixel: let them settle into a smooth swell.
    float far = smoothstep(200.0, 700.0, distance);
    vec2 tilt = facetTilt(vWorldPosition.xz) * (1.0 - far);
    vec3 normal = normalize(vec3(tilt.x, 1.0, tilt.y));

    // The water's colour and its sky reflection follow the calm surface, so facets don't flicker
    // between dark and bright; the facets only shade it a little and catch the sun.
    float facing = max(view.y, 0.0);
    float fresnel = pow(1.0 - facing, 4.0);
    vec3 color = mix(shallow, deep, smoothstep(0.0, 0.6, facing));
    color = mix(color, skyColor, 0.12 + 0.45 * fresnel);
    color *= 0.94 + 0.9 * dot(normal.xz, normalize(sunDirection.xz)) * (1.0 - far);

    // The sun's path: a soft band where the calm sea mirrors the low sun, and on it the odd facet
    // that mirrors the sun exactly, glinting far brighter than white.
    float path = max(dot(reflect(-view, vec3(0.0, 1.0, 0.0)), sunDirection), 0.0);
    color += sunColor * pow(path, 14.0) * 0.45;
    float exact = max(dot(reflect(-view, normal), sunDirection), 0.0);
    color += sunColor * smoothstep(0.992, 0.999, exact) * 2.5 * (1.0 - far);

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

/**
 * The sea below the cliffs: a plane at sea level that travels with the
 * camera, drawn as slowly rocking low-poly facets that catch the setting sun.
 */
export function Sea({ sun }: { sun: Vector3 }) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<ShaderMaterial>(null);
  const parameters = useMemo<ShaderMaterialParameters>(
    () => ({
      vertexShader,
      fragmentShader,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          time: { value: 0 },
          deep: { value: SUNSET.sea },
          shallow: { value: SUNSET.seaShallow },
          skyColor: { value: SUNSET.haze },
          sunColor: { value: SUNSET.sun },
          sunDirection: { value: sun },
        },
      ]),
      fog: true,
    }),
    [sun],
  );

  useFrame(({ camera, clock }) => {
    const sea = mesh.current;
    if (!sea) return;
    // Reaching past the far plane in every direction.
    sea.position.set(camera.position.x, 0, camera.position.z);
    sea.scale.set(camera.far * 2.2, camera.far * 2.2, 1);
    if (material.current) material.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial ref={material} args={[parameters]} />
    </mesh>
  );
}
