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
 * the draw distance. When it has room to spare again, it steps back up, but
 * not straight back to a level that has just proved too slow (`QualityRetries`).
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

/**
 * Frame rates below which the performance monitor lowers the quality, and
 * above which it raises it again, for a screen that refreshes `refreshRate`
 * times a second. They aim at a steady 60 fps, or the screen's own rate on a
 * slower screen. They are in the monitor's own measure: it counts the frames
 * that start and end each quarter-second sample, so a steady 60 fps reads as
 * about 64, and 54 fps as about 58.
 */
export function frameRateBounds(refreshRate: number): [number, number] {
  const target = Math.min(refreshRate, MEASURED_60_FPS);
  return [target * 0.9, target * 0.97];
}

/** A steady 60 fps, as the performance monitor measures it. */
const MEASURED_60_FPS = 64;

/** How long a level that proved too slow waits before it may be tried again, the first time. */
const FIRST_RETRY_SECONDS = 20;

/**
 * Which quality levels proved too slow, and when each may be tried again, so
 * that the quality doesn't flicker between two levels. A level may be tried
 * again after a wait, since a busy stretch of road passes, and the wait
 * doubles each time the level proves too slow again.
 */
export class QualityRetries {
  private readonly notBeforeSeconds = QUALITY_LEVELS.map(() => 0);
  private readonly waitSeconds = QUALITY_LEVELS.map(() => FIRST_RETRY_SECONDS);

  /** `level` proved too slow at `nowSeconds`. */
  tooSlow(level: number, nowSeconds: number) {
    this.notBeforeSeconds[level] = nowSeconds + this.waitSeconds[level];
    this.waitSeconds[level] *= 2;
  }

  /** Whether `level` may be tried at `nowSeconds`. */
  mayTry(level: number, nowSeconds: number): boolean {
    return nowSeconds >= this.notBeforeSeconds[level];
  }
}

/** Whether a WebGL renderer string names a software renderer, which has no GPU to spare. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}
