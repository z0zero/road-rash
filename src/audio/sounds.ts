import { clamp } from "@/math";
import { amplify, filter, glide, noise, strike, swell, tone, type Kit } from "./synth";

/**
 * The game's sound effects, synthesized: hits, crashes, skids, the siren and
 * the countdown. One-shot sounds play at once into `out` at `loudness` (0 to
 * 1); the siren and the skid are voices that keep running, turned up and down.
 */

/** A fist landing: a low thump under a slap. */
export function playPunch(kit: Kit, out: AudioNode, loudness: number) {
  const now = kit.context.currentTime;
  const thump = tone(kit, "sine", 170, now, 0.4);
  thump.frequency.exponentialRampToValueAtTime(55, now + 0.1);
  thump.connect(strike(kit, now, 1.2 * loudness, 0.002, 0.16)).connect(out);
  noise(kit, now, 0.2)
    .connect(filter(kit, "bandpass", 1400, 0.8))
    .connect(strike(kit, now, 1.2 * loudness, 0.001, 0.07))
    .connect(out);
}

/** A boot landing: a deeper thud, and the rattle of the bike it hits. */
export function playKick(kit: Kit, out: AudioNode, loudness: number) {
  const now = kit.context.currentTime;
  const thud = tone(kit, "sine", 125, now, 0.6);
  thud.frequency.exponentialRampToValueAtTime(42, now + 0.16);
  thud.connect(strike(kit, now, 1.3 * loudness, 0.003, 0.28)).connect(out);
  noise(kit, now, 0.3)
    .connect(filter(kit, "lowpass", 900))
    .connect(strike(kit, now, 1.0 * loudness, 0.002, 0.12))
    .connect(out);
  for (const [frequency, delay] of [
    [910, 0.012],
    [1490, 0.03],
  ]) {
    tone(kit, "triangle", frequency, now + delay, 0.4)
      .connect(strike(kit, now + delay, 0.18 * loudness, 0.001, 0.2))
      .connect(out);
  }
}

/** A club landing: a hard crack over a hollow knock and a thump. */
export function playClubHit(kit: Kit, out: AudioNode, loudness: number) {
  const now = kit.context.currentTime;
  noise(kit, now, 0.2)
    .connect(filter(kit, "bandpass", 2600, 1.4))
    .connect(strike(kit, now, 1.7 * loudness, 0.0008, 0.07))
    .connect(out);
  const knock = tone(kit, "triangle", 720, now, 0.4);
  knock.frequency.exponentialRampToValueAtTime(460, now + 0.08);
  knock.connect(strike(kit, now, 0.7 * loudness, 0.001, 0.13)).connect(out);
  const thump = tone(kit, "sine", 150, now, 0.5);
  thump.frequency.exponentialRampToValueAtTime(50, now + 0.12);
  thump.connect(strike(kit, now, 1.25 * loudness, 0.002, 0.24)).connect(out);
}

/** An attack swung through the air: a whoosh, slower and lower for a club. */
export function playSwing(kit: Kit, out: AudioNode, loudness: number, club: boolean) {
  const now = kit.context.currentTime;
  const seconds = club ? 0.28 : 0.16;
  const band = filter(kit, "bandpass", club ? 350 : 600, 1.8);
  band.frequency.setValueAtTime(club ? 350 : 600, now);
  band.frequency.exponentialRampToValueAtTime(club ? 1300 : 2200, now + seconds);
  noise(kit, now, seconds + 0.05)
    .connect(band)
    .connect(swell(kit, now, 0.35 * loudness, seconds * 0.6, 0, seconds * 0.4))
    .connect(out);
}

/**
 * A crash, harder the faster it was (`force` 0 to 1): the tyres skid, the
 * rider and bike hit the road, loose parts clatter and the bike scrapes along
 * the tarmac.
 */
export function playCrash(kit: Kit, out: AudioNode, force: number) {
  const now = kit.context.currentTime;
  playSkid(kit, out, now, 0.35, 0.8 * force);
  const impact = now + 0.06;
  noise(kit, impact, 1)
    .connect(filter(kit, "lowpass", 1400))
    .connect(strike(kit, impact, 1.3 * force, 0.003, 0.5))
    .connect(out);
  const boom = tone(kit, "sine", 95, impact, 0.9);
  boom.frequency.exponentialRampToValueAtTime(32, impact + 0.35);
  boom.connect(strike(kit, impact, 1.3 * force, 0.004, 0.55)).connect(out);
  // Loose parts bouncing off the road, fewer and quieter as they settle.
  for (let i = 0; i < 7; i++) {
    const when = impact + 0.03 + i * 0.09 + Math.random() * 0.06;
    noise(kit, when, 0.3)
      .connect(filter(kit, "bandpass", 1800 + Math.random() * 3400, 7))
      .connect(strike(kit, when, (0.7 - i * 0.08) * force, 0.001, 0.08 + Math.random() * 0.08))
      .connect(out);
  }
  // The bike sliding along the tarmac, slowing down.
  const scrape = filter(kit, "bandpass", 2400, 1.5);
  scrape.frequency.setValueAtTime(2400, impact);
  scrape.frequency.exponentialRampToValueAtTime(700, impact + 1.4);
  noise(kit, impact, 1.8)
    .connect(scrape)
    .connect(swell(kit, impact, 0.6 * force, 0.08, 0.4 + 0.5 * force, 0.9))
    .connect(out);
}

/** A car running into a rider on foot: its horn blares as it runs into them with a dull thud. */
export function playKnockDown(kit: Kit, out: AudioNode, loudness: number) {
  const now = kit.context.currentTime;
  // The horn: two notes a third apart, held for half a second.
  const horn = filter(kit, "lowpass", 2000);
  for (const frequency of [392, 494]) tone(kit, "square", frequency, now, 0.6).connect(horn);
  horn.connect(swell(kit, now, 0.16 * loudness, 0.01, 0.42, 0.12)).connect(out);
  // The rider thrown against the car.
  const impact = now + 0.04;
  const thud = tone(kit, "sine", 120, impact, 0.6);
  thud.frequency.exponentialRampToValueAtTime(40, impact + 0.2);
  thud.connect(strike(kit, impact, 1.3 * loudness, 0.003, 0.35)).connect(out);
  noise(kit, impact, 0.4)
    .connect(filter(kit, "lowpass", 700))
    .connect(strike(kit, impact, 0.9 * loudness, 0.002, 0.15))
    .connect(out);
}

/** Tyres skidding from `when` for `seconds`: a short, wavering squeal. */
function playSkid(kit: Kit, out: AudioNode, when: number, seconds: number, loudness: number) {
  const squeal = tone(kit, "sawtooth", 1250, when, seconds + 0.1);
  squeal.frequency.linearRampToValueAtTime(1050, when + seconds);
  squeal
    .connect(filter(kit, "bandpass", 1300, 3))
    .connect(swell(kit, when, 0.5 * loudness, 0.02, seconds * 0.5, seconds * 0.5))
    .connect(out);
}

/** The countdown's beeps: a short low one for 3, 2 and 1, and a long high one for GO. */
export function playCountdownBeep(kit: Kit, out: AudioNode, go: boolean) {
  const now = kit.context.currentTime;
  const seconds = go ? 0.5 : 0.15;
  tone(kit, "square", go ? 880 : 440, now, seconds + 0.05)
    .connect(filter(kit, "lowpass", 3000))
    .connect(swell(kit, now, 0.2, 0.005, seconds - 0.035, 0.03))
    .connect(out);
}

/** Taking a club off someone: a bright, rising two-note chime. */
export function playGrab(kit: Kit, out: AudioNode, loudness: number) {
  const now = kit.context.currentTime;
  for (const [frequency, delay] of [
    [988, 0],
    [1319, 0.07],
  ]) {
    tone(kit, "triangle", frequency, now + delay, 0.4)
      .connect(strike(kit, now + delay, 0.3 * loudness, 0.003, 0.25))
      .connect(out);
  }
}

/** Crossing the finish line: a quick rising fanfare. */
export function playFinish(kit: Kit, out: AudioNode) {
  const now = kit.context.currentTime;
  [523, 659, 784, 1047].forEach((frequency, note) => {
    const when = now + note * 0.09;
    const last = note === 3;
    tone(kit, "square", frequency, when, last ? 0.7 : 0.15)
      .connect(filter(kit, "lowpass", 3200))
      .connect(swell(kit, when, 0.16, 0.005, last ? 0.35 : 0.06, last ? 0.3 : 0.03))
      .connect(out);
  });
}

/** The two tones of the siren, hertz, and how long each sounds before the other, seconds. */
const SIREN_TONES_HZ = [960, 770];
const SIREN_TONE_SECONDS = 0.55;
/** How loud the siren is from a cop right beside the player. */
const SIREN_LOUDNESS = 0.22;
/** The siren sounds duller the further off it is: the cutoff of its low-pass beside the player, and at its faintest (hertz). */
const SIREN_BRIGHT_HZ = 2600;
const SIREN_DULL_HZ = 1100;

/** A cop's two-tone siren, alternating between its tones, heard from wherever the cop is. */
export class Siren {
  private readonly voice: OscillatorNode;
  private readonly tone: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly pan: StereoPannerNode;

  constructor(
    private readonly kit: Kit,
    out: AudioNode,
  ) {
    const now = kit.context.currentTime;
    const [high, low] = SIREN_TONES_HZ;
    this.voice = tone(kit, "sawtooth", (high + low) / 2, now);
    // A slow square wave flips the pitch between the two tones; a low-pass softens each change.
    const flip = tone(kit, "square", 1 / (2 * SIREN_TONE_SECONDS), now);
    flip
      .connect(amplify(kit, (high - low) / 2))
      .connect(filter(kit, "lowpass", 25, 0.7))
      .connect(this.voice.frequency);
    this.tone = filter(kit, "lowpass", SIREN_BRIGHT_HZ);
    this.level = amplify(kit, 0);
    this.pan = kit.context.createStereoPanner();
    this.voice.connect(this.tone).connect(this.level).connect(this.pan).connect(out);
  }

  /**
   * Sounds the siren as the player hears it: at `loudness`, from 0 (silent,
   * with no cop near) to 1 (a cop right beside them), from `pan` (-1 left to
   * 1 right), its pitch shifted by `doppler` (1 for none).
   */
  follow(loudness: number, pan = 0, doppler = 1) {
    const heard = clamp(loudness, 0, 1);
    glide(this.kit, this.level.gain, SIREN_LOUDNESS * heard, heard > 0 ? 0.08 : 0.25);
    glide(this.kit, this.pan.pan, clamp(pan, -1, 1), 0.05);
    glide(this.kit, this.tone.frequency, SIREN_DULL_HZ + (SIREN_BRIGHT_HZ - SIREN_DULL_HZ) * heard, 0.1);
    if (doppler > 0) glide(this.kit, this.voice.detune, 1200 * Math.log2(doppler), 0.05);
  }
}

/** The squeal of tyres skidding under hard braking, as loud as the skid is hard. */
export class Skid {
  private readonly level: GainNode;

  constructor(
    private readonly kit: Kit,
    out: AudioNode,
  ) {
    const now = kit.context.currentTime;
    this.level = amplify(kit, 0);
    // Two close tones, wavering together, and the hiss of rubber on tarmac.
    const waver = tone(kit, "sine", 11, now).connect(amplify(kit, 35));
    const band = filter(kit, "bandpass", 1250, 3);
    for (const frequency of [1150, 1310]) {
      const squeal = tone(kit, "sawtooth", frequency, now);
      waver.connect(squeal.frequency);
      squeal.connect(band);
    }
    band.connect(amplify(kit, 0.5)).connect(this.level);
    noise(kit, now).connect(filter(kit, "bandpass", 3500, 0.8)).connect(amplify(kit, 0.35)).connect(this.level);
    this.level.connect(out);
  }

  /** How hard the tyres are skidding, 0 (not at all) to 1. */
  setIntensity(intensity: number) {
    glide(this.kit, this.level.gain, 0.3 * clamp(intensity, 0, 1), 0.05);
  }
}

/** Gravel crunching under the tyres off the road, louder the faster the bike goes. */
export class Gravel {
  private readonly level: GainNode;

  constructor(
    private readonly kit: Kit,
    out: AudioNode,
  ) {
    const now = kit.context.currentTime;
    this.level = amplify(kit, 0);
    // A low rumble and a crunch, broken up by an uneven flutter from slowly wandering noise.
    const flutter = amplify(kit, 0.6);
    noise(kit, now).connect(filter(kit, "lowpass", 30)).connect(amplify(kit, 20)).connect(flutter.gain);
    noise(kit, now).connect(filter(kit, "lowpass", 500)).connect(amplify(kit, 0.9)).connect(flutter);
    noise(kit, now).connect(filter(kit, "bandpass", 1800, 0.9)).connect(amplify(kit, 0.45)).connect(flutter);
    flutter.connect(this.level).connect(out);
  }

  /** How hard the bike is ploughing through the gravel, 0 (not at all) to 1. */
  setIntensity(intensity: number) {
    glide(this.kit, this.level.gain, 0.4 * clamp(intensity, 0, 1), 0.06);
  }
}
