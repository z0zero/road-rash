import type { Settings } from "@/save-data/save-data";

/**
 * Where every sound goes on its way to the speakers: a music bus and an
 * effects bus, each with the player's volume and a level the game sets (the
 * music ducks while paused, the effects fall silent), then a compressor so
 * big crashes don't clip, then the master volume. The engines ride on the
 * effects bus but duck with the music under a hit, so the hit stands out.
 */
export interface Mixer {
  /** Music connects here. */
  readonly music: AudioNode;
  /** Sound effects connect here: hits, crashes, the siren, the countdown. */
  readonly effects: AudioNode;
  /** The running sounds of riding connect here: engines, skids, gravel. They are effects too. */
  readonly riding: AudioNode;
  /** Applies the player's master, music and effects volumes. */
  setVolumes(settings: Settings): void;
  /** Sets the music's level and the effects' level, each 0 to 1, easing there over a moment. */
  setLevels(music: number, effects: number): void;
  /** Dips the music and the riding sounds for a moment, by `depth` (0 to 1), so a hit stands out. */
  duck(depth: number): void;
}

/** The music sits under the engine and the hits: the track is mastered loud. */
const MUSIC_MIX = 0.42;

/** The compressor lifts everything it lets through; this takes the lift back, leaving headroom for crashes. */
const OUTPUT_TRIM = 0.6;

/** How quickly levels and volumes ease to a new value, in seconds (a time constant). */
const EASE_SECONDS = 0.06;

/** A duck dips at once, holds briefly, then recovers over a moment (seconds). */
const DUCK_DIP_SECONDS = 0.008;
const DUCK_HOLD_SECONDS = 0.1;
const DUCK_RECOVER_SECONDS = 0.12;

export function createMixer(context: BaseAudioContext): Mixer {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 6;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.2;
  const master = context.createGain();
  compressor.connect(master).connect(context.destination);

  const musicVolume = context.createGain();
  const musicLevel = context.createGain();
  const musicDuck = context.createGain();
  musicVolume.connect(musicLevel).connect(musicDuck).connect(compressor);
  const effectsVolume = context.createGain();
  const effectsLevel = context.createGain();
  effectsVolume.connect(effectsLevel).connect(compressor);
  const riding = context.createGain();
  riding.connect(effectsVolume);
  const ridingDuck = riding.gain;

  const ease = (param: AudioParam, value: number) => param.setTargetAtTime(value, context.currentTime, EASE_SECONDS);

  return {
    music: musicVolume,
    effects: effectsVolume,
    riding,
    setVolumes(settings) {
      ease(master.gain, loudness(settings.masterVolume) * OUTPUT_TRIM);
      ease(musicVolume.gain, loudness(settings.musicVolume) * MUSIC_MIX);
      ease(effectsVolume.gain, loudness(settings.effectsVolume));
    },
    setLevels(music, effects) {
      ease(musicLevel.gain, music);
      ease(effectsLevel.gain, effects);
    },
    duck(depth) {
      const now = context.currentTime;
      const dipped = 1 - Math.min(1, Math.max(0, depth));
      for (const param of [musicDuck.gain, ridingDuck]) {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.setTargetAtTime(dipped, now, DUCK_DIP_SECONDS);
        param.setTargetAtTime(1, now + DUCK_HOLD_SECONDS, DUCK_RECOVER_SECONDS);
      }
    },
  };
}

/** A volume setting (0 to 1) as a gain: squared, so halfway on the slider sounds about half as loud. */
function loudness(volume: number): number {
  const clamped = Math.min(1, Math.max(0, volume));
  return clamped * clamped;
}
