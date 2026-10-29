/** How quickly trauma fades (per second). */
const RECOVERY = 1.6;

/**
 * Camera shake driven by "trauma": kicks add trauma that fades away, steady
 * sources hold it up, and the shake grows with trauma squared, so small
 * rumbles stay subtle while big hits jolt. Offsets come from smooth noise,
 * never from frame-to-frame jitter.
 */
export class CameraShake {
  private trauma = 0;
  private time = 0;
  /** Metres sideways and up, and radians of roll, for this frame. */
  readonly offset = { x: 0, y: 0, roll: 0 };

  /** A sudden jolt, such as a hit or a crash: `amount` from 0 (none) to 1 (as hard as it gets). */
  kick(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Moves the shake on by `delta` seconds, with `steady` the trauma that
   * ongoing sources (rumble, riding off the road) hold it at. With `still`,
   * it stops shaking altogether.
   */
  update(delta: number, steady: number, still: boolean) {
    this.time += delta;
    this.trauma = Math.max(steady, this.trauma - RECOVERY * delta);
    const shake = still ? 0 : this.trauma * this.trauma;
    const t = this.time;
    this.offset.x = shake * 0.18 * wave(t * 23.1, t * 31.7);
    this.offset.y = shake * 0.14 * wave(t * 27.3, t * 19.9);
    this.offset.roll = shake * 0.035 * wave(t * 17.3, t * 29.1);
  }
}

/** Smooth noise in about [-1, 1] from two incommensurate sines. */
function wave(a: number, b: number) {
  return 0.6 * Math.sin(a) + 0.4 * Math.sin(b + 1.3);
}
