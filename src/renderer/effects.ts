import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Color, Uniform, Vector2 } from "three";

/** Where on screen the road vanishes, roughly: speed lines and motion blur stream out from it. */
const VANISHING_POINT = new Vector2(0.5, 0.56);

/**
 * Colour grading for the sunset, after tone mapping: warm highlights, violet
 * shadows, a touch more saturation and contrast.
 */
export class ColorGradeEffect extends Effect {
  constructor() {
    super(
      "ColorGradeEffect",
      /* glsl */ `
        uniform vec3 shadowTint;
        uniform vec3 highlightTint;
        uniform float saturation;
        uniform float contrast;

        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          // Grade in a perceptual space, where 0.5 is a middle grey.
          vec3 color = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color += shadowTint * (1.0 - smoothstep(0.0, 0.5, luma));
          color += highlightTint * smoothstep(0.45, 1.0, luma);
          luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(luma), color, saturation);
          color = (color - 0.5) * contrast + 0.5;
          outputColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(2.2)), inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([
          ["shadowTint", new Uniform(new Color(0.03, 0.0, 0.05))],
          ["highlightTint", new Uniform(new Color(0.05, 0.02, -0.03))],
          ["saturation", new Uniform(1.12)],
          ["contrast", new Uniform(1.08)],
        ]),
      },
    );
  }
}

/** White streaks rushing out from the vanishing point towards the edges of the screen at high speed. */
export class SpeedLinesEffect extends Effect {
  private readonly strength = new Uniform(0);

  constructor() {
    super(
      "SpeedLinesEffect",
      /* glsl */ `
        uniform float strength;
        uniform vec2 focus;

        float hash(float n) {
          return fract(sin(n * 12.9898) * 43758.5453);
        }

        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          if (strength <= 0.001) {
            outputColor = inputColor;
            return;
          }
          vec2 p = (uv - focus) * vec2(aspect, 1.0);
          float reach = length(p);
          float around = atan(p.y, p.x) / 6.2831853 + 0.5;
          const float lanes = 160.0;
          float lane = floor(around * lanes);
          float across = abs(fract(around * lanes) - 0.5) * 2.0;
          float seed = hash(lane);
          float pace = hash(lane + 31.0);
          // Only some lanes carry a streak; each is a short dash rushing outwards.
          float carried = step(0.72, seed);
          float along = fract(reach * 0.8 - time * (1.1 + 1.6 * pace) + seed * 9.0);
          float dash = smoothstep(0.0, 0.04, along) * (1.0 - smoothstep(0.1, 0.2, along));
          float thin = 1.0 - smoothstep(0.05, 0.25 + 0.15 * pace, across);
          float edge = smoothstep(0.45, 0.85, reach);
          float line = carried * dash * thin * edge * strength;
          outputColor = vec4(inputColor.rgb + vec3(1.0, 0.94, 0.86) * line * 0.35, inputColor.a);
        }
      `,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([["focus", new Uniform(VANISHING_POINT)]]),
      },
    );
    this.uniforms.set("strength", this.strength);
  }

  /** 0 (none) to 1 (full). */
  setStrength(value: number) {
    this.strength.value = value;
  }
}

/** Motion blur streaking outwards from the vanishing point, strongest at the edges of the screen. */
export class SpeedBlurEffect extends Effect {
  private readonly strength = new Uniform(0);

  constructor() {
    super(
      "SpeedBlurEffect",
      /* glsl */ `
        uniform float strength;
        uniform vec2 focus;

        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          if (strength <= 0.001) {
            outputColor = inputColor;
            return;
          }
          vec2 outwards = uv - focus;
          float edge = smoothstep(0.2, 0.75, length(outwards * vec2(aspect, 1.0)));
          vec2 step = outwards * strength * edge * 0.007;
          vec4 total = inputColor;
          for (int i = 1; i < 6; i++) {
            total += texture2D(inputBuffer, uv - step * float(i));
          }
          outputColor = total / 6.0;
        }
      `,
      {
        attributes: EffectAttribute.CONVOLUTION,
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, Uniform>([["focus", new Uniform(VANISHING_POINT)]]),
      },
    );
    this.uniforms.set("strength", this.strength);
  }

  /** 0 (none) to 1 (full). */
  setStrength(value: number) {
    this.strength.value = value;
  }
}
