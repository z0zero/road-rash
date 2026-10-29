/**
 * The race's music: "Funked Up" by Joth, a looping funk-rock track (guitar,
 * bass, drums and Rhodes) from OpenGameArt.org. It was downloaded from
 * https://opengameart.org/content/funked-up on 2026-10-29, when that page gave
 * its licence as CC0 (https://creativecommons.org/publicdomain/zero/1.0/). The
 * author appreciates credit but doesn't require it; the Credits screen gives it.
 * The file in public/audio is the download unchanged (1,329,549 bytes, SHA-256
 * 57cd81254a0f4e068535c5421f93b586514332ad2377f81aea190dd91659fff3).
 */
export const MUSIC = {
  title: "Funked Up",
  author: "Joth",
  authorPage: "https://opengameart.org/users/joth",
  page: "https://opengameart.org/content/funked-up",
  licence: "CC0",
  licencePage: "https://creativecommons.org/publicdomain/zero/1.0/",
  url: "/audio/funked-up.mp3",
} as const;

/**
 * The loop: 24 bars at 87 bpm (2,919,724 samples at 44.1 kHz), which the MP3
 * encoder delayed by 528 samples and padded at the end, as the file's gapless
 * playback tag records. Decoders that honour the tag drop the delay and the
 * padding; the others keep them, and the loop skips them.
 */
const LOOP_SECONDS = 2_919_724 / 44_100;
const ENCODER_DELAY_SECONDS = 528 / 44_100;

/** How long the music takes to fade in or out, in seconds. */
const FADE_SECONDS = 0.6;

/** The music file's bytes, or null when they can't be had (offline, aborted). Never rejects. */
export async function fetchMusic(signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(MUSIC.url, { signal });
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Plays the music on a seamless loop, fading in when it starts and out when it stops. */
export class MusicLoop {
  private buffer: AudioBuffer | null = null;
  private playing: { readonly source: AudioBufferSourceNode; readonly fade: GainNode } | null = null;
  private wanted = false;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  /** Hands over the decoded music; it starts at once if it should be playing. */
  setBuffer(buffer: AudioBuffer) {
    this.buffer = buffer;
    if (this.wanted) this.play();
  }

  /** Plays the music from the top, unless it's playing already (or as soon as it has been decoded). */
  play() {
    this.wanted = true;
    if (this.playing || !this.buffer) return;
    const { context, buffer } = this;
    const delayed = buffer.duration > LOOP_SECONDS + ENCODER_DELAY_SECONDS / 2;
    const start = delayed ? ENCODER_DELAY_SECONDS : 0;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = Math.min(start + LOOP_SECONDS, buffer.duration);
    const fade = context.createGain();
    fade.gain.setValueAtTime(0, context.currentTime);
    fade.gain.linearRampToValueAtTime(1, context.currentTime + FADE_SECONDS / 4);
    source.connect(fade).connect(this.destination);
    source.start(context.currentTime, start);
    this.playing = { source, fade };
  }

  /** Fades the music out. */
  stop() {
    this.wanted = false;
    if (!this.playing) return;
    const { source, fade } = this.playing;
    const now = this.context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.setTargetAtTime(0, now, FADE_SECONDS / 4);
    source.stop(now + FADE_SECONDS * 1.5);
    this.playing = null;
  }
}
