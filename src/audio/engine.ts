import { clamp } from "@/math";
import { amplify, filter, glide, noise, roughen, tone, type Kit } from "./synth";

/**
 * The sound of a bike's four-cylinder engine, pitched by the bike's speed.
 *
 * Speed turns into revs through a six-speed gearbox, so the pitch climbs with
 * speed and drops back at each change up, as a real bike's does. Pulling hard
 * makes the engine louder and brighter; easing off quietens it. This is how
 * the bike sounds, not how it rides: the race decides the speed.
 */

/** Speed at the redline in each gear, metres per second (top gear tops out past the bike's 62.5 m/s). */
const GEAR_TOP_SPEEDS = [15, 25, 35, 45, 55, 66];
const IDLE_RPM = 1500;
const REDLINE_RPM = 12500;
const CHANGE_UP_RPM = 11500;
const CHANGE_DOWN_RPM = 5500;
/** Slipping the clutch away from a standstill holds the revs up to this much over idle at full pull. */
const CLUTCH_SLIP_RPM = 4000;
/** Acceleration (m/s²) that counts as pulling as hard as the engine can. */
const FULL_PULL = 5;

/** How a particular engine sounds: its pitch (1 is the player's) and how loud it is at full volume. */
export interface EngineCharacter {
  readonly pitch: number;
  readonly loudness: number;
}

/** The player's engine. */
export const PLAYER_ENGINE: EngineCharacter = { pitch: 1, loudness: 0.12 };

/** An opponent's engine: a little lower, so it stands apart from the player's as it comes past. */
export const OPPONENT_ENGINE: EngineCharacter = { pitch: 0.94, loudness: 0.09 };

export class EngineSound {
  private gear = 1;
  private readonly firing: OscillatorNode[];
  private readonly crank: OscillatorNode;
  private readonly crankDepth: GainNode;
  private readonly breath: BiquadFilterNode;
  private readonly breathLevel: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly pan: StereoPannerNode;

  constructor(
    private readonly kit: Kit,
    out: AudioNode,
    private readonly character: EngineCharacter,
  ) {
    const { context } = kit;
    const now = context.currentTime;
    const mix = amplify(kit, 1);
    // Two slightly detuned saws at the firing rate, and a square an octave down for the crank's lope.
    this.firing = [1, 1.004].map((detune) => {
      const oscillator = tone(kit, "sawtooth", 50 * detune, now);
      oscillator.connect(amplify(kit, 0.45)).connect(mix);
      return oscillator;
    });
    const lope = tone(kit, "square", 25, now);
    lope.connect(amplify(kit, 0.3)).connect(mix);
    this.firing.push(lope);
    // Intake and exhaust roar: noise around a few times the firing rate, louder under load.
    this.breath = filter(kit, "bandpass", 200, 1.2);
    this.breathLevel = amplify(kit, 0.15);
    noise(kit, now).connect(this.breath).connect(this.breathLevel).connect(mix);

    this.tone = filter(kit, "lowpass", 400, 0.9);
    // The crank's pulses: the level throbs at half the firing rate, more so at low revs.
    const throb = amplify(kit, 1);
    this.crank = tone(kit, "sine", 25, now);
    this.crankDepth = amplify(kit, 0.25);
    this.crank.connect(this.crankDepth).connect(throb.gain);
    this.level = amplify(kit, 0);
    mix.connect(roughen(kit, 2.5)).connect(this.tone).connect(throb).connect(this.level);
    this.pan = context.createStereoPanner();
    this.level.connect(this.pan).connect(out);
  }

  /**
   * Follows a bike going at `speed` (m/s) and gaining speed at `acceleration`
   * (m/s², negative when slowing), heard at `loudness` (0 to 1) from `pan`
   * (-1 left to 1 right), its pitch shifted by `doppler` (1 for none).
   */
  follow(speed: number, acceleration: number, loudness: number, pan = 0, doppler = 1) {
    const { kit } = this;
    const gearBefore = this.gear;
    while (this.gear < GEAR_TOP_SPEEDS.length && revsIn(this.gear, speed) > CHANGE_UP_RPM) this.gear++;
    while (this.gear > 1 && revsIn(this.gear, speed) < CHANGE_DOWN_RPM) this.gear--;
    const load = clamp(acceleration / FULL_PULL, -1, 1);
    const pull = Math.max(0, load);
    let revs = Math.max(IDLE_RPM, revsIn(this.gear, speed));
    if (this.gear === 1) revs = Math.max(revs, IDLE_RPM + pull * CLUTCH_SLIP_RPM);
    // An inline four fires twice every turn of the crank.
    const firing = (revs / 30) * this.character.pitch * doppler;
    const changedUp = this.gear > gearBefore;
    const pitchSeconds = changedUp ? 0.06 : 0.035;
    glide(kit, this.firing[0].frequency, firing, pitchSeconds);
    glide(kit, this.firing[1].frequency, firing * 1.004, pitchSeconds);
    glide(kit, this.firing[2].frequency, firing / 2, pitchSeconds);
    glide(kit, this.crank.frequency, firing / 2, pitchSeconds);
    glide(kit, this.crankDepth.gain, clamp(0.3 - revs / 50000, 0.06, 0.3), 0.1);
    glide(kit, this.breath.frequency, Math.min(firing * 4, 6000), pitchSeconds);
    glide(kit, this.breathLevel.gain, 0.12 + 0.45 * pull, 0.08);
    glide(kit, this.tone.frequency, Math.min(250 + firing * 3.2 + pull * 1800, 7500), 0.05);
    // Changing up cuts the power for a moment; easing off quietens the engine.
    const effort = changedUp ? 0.55 : load < 0 ? 0.7 : 0.75 + 0.25 * pull;
    glide(kit, this.level.gain, this.character.loudness * clamp(loudness, 0, 1) * effort, changedUp ? 0.02 : 0.06);
    glide(kit, this.pan.pan, clamp(pan, -1, 1), 0.05);
  }

  /** Forgets the gear, for when the engine starts following a different bike. */
  reset() {
    this.gear = 1;
  }
}

function revsIn(gear: number, speed: number): number {
  return (speed / GEAR_TOP_SPEEDS[gear - 1]) * REDLINE_RPM;
}
