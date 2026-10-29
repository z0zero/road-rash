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
 * The loop: 24 bars at 87 bpm, 2,919,724 samples at 44.1 kHz. The MP3 encoder
 * delayed it by 528 samples and padded it to whole frames, as the file's
 * gapless playback tag records. Decoders that honour the tag drop the delay
 * and the padding. Others (Chromium's among them) keep the delay, add 529
 * samples of their own, and end with 1,843 samples of padding after the
 * music, so the loop starts wherever the music does, before that padding.
 */
const LOOP_SECONDS = 2_919_724 / 44_100;
const TRAILING_PADDING_SECONDS = 1_843 / 44_100;

/** The loop's last and first moments fade, so its end meets its start without a click. */
const SEAM_FADE_SECONDS = 0.002;

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
  private loop: { readonly buffer: AudioBuffer; readonly start: number; readonly end: number } | null = null;
  private playing: { readonly source: AudioBufferSourceNode; readonly fade: GainNode } | null = null;
  private wanted = false;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly destination: AudioNode,
  ) {}

  /** Hands over the decoded music; it starts at once if it should be playing. */
  setBuffer(buffer: AudioBuffer) {
    const start = Math.max(0, buffer.duration - LOOP_SECONDS - TRAILING_PADDING_SECONDS);
    const end = Math.min(start + LOOP_SECONDS, buffer.duration);
    softenSeam(buffer, start, end);
    this.loop = { buffer, start, end };
    if (this.wanted) this.play();
  }

  /** Plays the music from the top, unless it's playing already (or as soon as it has been decoded). */
  play() {
    this.wanted = true;
    if (this.playing || !this.loop) return;
    const { context } = this;
    const { buffer, start, end } = this.loop;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = end;
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

/** Fades the music in over the loop's first moment and out over its last, where the two meet. */
function softenSeam(buffer: AudioBuffer, start: number, end: number) {
  const fade = Math.round(SEAM_FADE_SECONDS * buffer.sampleRate);
  const first = Math.round(start * buffer.sampleRate);
  const last = Math.min(Math.round(end * buffer.sampleRate), buffer.length) - 1;
  if (last - first < 2 * fade) return;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < fade; i++) {
      samples[first + i] *= i / fade;
      samples[last - i] *= i / fade;
    }
  }
}
