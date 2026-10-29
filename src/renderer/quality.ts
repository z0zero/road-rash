/** How much the renderer draws: the performance monitor trades these away to keep the frame rate up. */
export interface QualityLevel {
  /** Render resolution as a share of the screen's own pixel density (capped at 2). */
  readonly resolution: number;
  /** Sharp shadows from the sun over everything near the rider, softer and fewer, or none. */
  readonly shadows: "high" | "low" | "off";
  /** Metres to the far edge of the fog; nothing beyond it is drawn. */
  readonly drawDistance: number;
}

/**
 * Quality from best to cheapest. When the frame rate drops, the performance
 * monitor steps down: the render resolution first, then the shadows, then
 * the draw distance. When it has room to spare again, it steps back up.
 */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { resolution: 1, shadows: "high", drawDistance: 1300 },
  { resolution: 0.85, shadows: "high", drawDistance: 1300 },
  { resolution: 0.72, shadows: "high", drawDistance: 1300 },
  { resolution: 0.6, shadows: "high", drawDistance: 1300 },
  { resolution: 0.6, shadows: "low", drawDistance: 1300 },
  { resolution: 0.6, shadows: "off", drawDistance: 1300 },
  { resolution: 0.6, shadows: "off", drawDistance: 900 },
  { resolution: 0.6, shadows: "off", drawDistance: 600 },
];

/** The cheapest level, where a software renderer starts. */
export const LOWEST_QUALITY = QUALITY_LEVELS.length - 1;

/** The device pixel ratio a level renders at on a screen with `devicePixelRatio`. */
export function pixelRatio(level: QualityLevel, devicePixelRatio: number): number {
  return Math.min(2, Math.max(1, devicePixelRatio)) * level.resolution;
}

/** Whether a WebGL renderer string names a software renderer, which has no GPU to spare. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}
