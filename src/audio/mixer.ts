import type { Settings } from "@/save-data/save-data";

/**
 * Where every sound goes on its way to the speakers: a music bus and an
 * effects bus, each with the player's volume and a level the game sets (the
 * music ducks while paused, the effects fall silent), then a compressor so
 * big crashes don't clip, then the master volume.
 */
export interface Mixer {
  /** Music connects here. */
  readonly music: AudioNode;
  /** Every sound effect connects here. */
  readonly effects: AudioNode;
  /** Applies the player's master, music and effects volumes. */
  setVolumes(settings: Settings): void;
  /** Sets the music's level and the effects' level, each 0 to 1, easing there over a moment. */
  setLevels(music: number, effects: number): void;
}

/** The music sits under the engine and the hits: the track is mastered loud. */
const MUSIC_MIX = 0.42;

/** How quickly levels and volumes ease to a new value, in seconds (a time constant). */
const EASE_SECONDS = 0.06;

export function createMixer(context: AudioContext): Mixer {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.25;
  const master = context.createGain();
  compressor.connect(master).connect(context.destination);

  const musicVolume = context.createGain();
  const musicLevel = context.createGain();
  musicVolume.connect(musicLevel).connect(compressor);
  const effectsVolume = context.createGain();
  const effectsLevel = context.createGain();
  effectsVolume.connect(effectsLevel).connect(compressor);

  const ease = (param: AudioParam, value: number) => param.setTargetAtTime(value, context.currentTime, EASE_SECONDS);

  return {
    music: musicVolume,
    effects: effectsVolume,
    setVolumes(settings) {
      ease(master.gain, loudness(settings.masterVolume));
      ease(musicVolume.gain, loudness(settings.musicVolume) * MUSIC_MIX);
      ease(effectsVolume.gain, loudness(settings.effectsVolume));
    },
    setLevels(music, effects) {
      ease(musicLevel.gain, music);
      ease(effectsLevel.gain, effects);
    },
  };
}

/** A volume setting (0 to 1) as a gain: squared, so halfway on the slider sounds about half as loud. */
function loudness(volume: number): number {
  const clamped = Math.min(1, Math.max(0, volume));
  return clamped * clamped;
}
