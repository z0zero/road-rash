/**
 * Building blocks for synthesized sounds: noise, tones, filters and
 * envelopes. Times are in the audio context's seconds.
 */

/** What every sound is made from: the audio context and a shared second of white noise. */
export interface Kit {
  readonly context: BaseAudioContext;
  readonly noise: AudioBuffer;
}

export function createKit(context: BaseAudioContext): Kit {
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return { context, noise };
}

/** White noise from `when` for `seconds` (forever if omitted), from a random point so no two bursts sound alike. */
export function noise(kit: Kit, when: number, seconds?: number): AudioBufferSourceNode {
  const source = kit.context.createBufferSource();
  source.buffer = kit.noise;
  source.loop = true;
  source.start(when, Math.random() * kit.noise.duration);
  if (seconds !== undefined) source.stop(when + seconds);
  return source;
}

/** An oscillator at `frequency` hertz from `when` for `seconds` (forever if omitted). */
export function tone(
  kit: Kit,
  type: OscillatorType,
  frequency: number,
  when: number,
  seconds?: number,
): OscillatorNode {
  const oscillator = kit.context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  oscillator.start(when);
  if (seconds !== undefined) oscillator.stop(when + seconds);
  return oscillator;
}

export function filter(kit: Kit, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
  const node = kit.context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/** A gain at a steady `value`. */
export function amplify(kit: Kit, value: number): GainNode {
  const node = kit.context.createGain();
  node.gain.value = value;
  return node;
}

/**
 * A gain that strikes: up to `peak` in `attack` seconds from `when`, then dying
 * away to under 5% within `decay` more seconds.
 */
export function strike(kit: Kit, when: number, peak: number, attack: number, decay: number): GainNode {
  const node = kit.context.createGain();
  node.gain.setValueAtTime(0, when);
  node.gain.linearRampToValueAtTime(peak, when + attack);
  node.gain.setTargetAtTime(0, when + attack, decay / 3);
  return node;
}

/** A gain that swells to `peak` over `rise` seconds from `when`, holds for `hold`, then fades over `fall`. */
export function swell(kit: Kit, when: number, peak: number, rise: number, hold: number, fall: number): GainNode {
  const node = kit.context.createGain();
  node.gain.setValueAtTime(0, when);
  node.gain.linearRampToValueAtTime(peak, when + rise);
  node.gain.setValueAtTime(peak, when + rise + hold);
  node.gain.linearRampToValueAtTime(0, when + rise + hold + fall);
  return node;
}

/** Glides `param` towards `value`, getting about two-thirds of the way there every `seconds`. */
export function glide(kit: Kit, param: AudioParam, value: number, seconds: number) {
  if (Number.isFinite(value)) param.setTargetAtTime(value, kit.context.currentTime, seconds);
}

/** A soft clipper that roughens what passes through it, `drive` times over. */
export function roughen(kit: Kit, drive: number): WaveShaperNode {
  const node = kit.context.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  node.curve = curve;
  node.oversample = "2x";
  return node;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
