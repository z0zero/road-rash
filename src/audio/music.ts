/**
 * The race's music: "Hot Roadway [Remake]" by MintoDog, a looping
 * electric-guitar racing track at 160 bpm, from OpenGameArt.org. It was
 * downloaded from https://opengameart.org/content/hot-roadway-remake on
 * 2026-10-30, when that page gave its licence as CC0
 * (https://creativecommons.org/publicdomain/zero/1.0/) and asked for no
 * credit; the Credits screen gives it anyway. The download,
 * hot_roadway_remake_bpm160.mp3 (4,802,477 bytes at 320 kbps, SHA-256
 * 3183bc8e71cb5c8b2bb3eb71c6dd19486fe262dbc268a3ddfa5d59b2e9a9afce), is over
 * the game's 3 MB for its music, so the file in public/audio is that download
 * encoded again at 192 kbps, which CC0 allows. With ffmpeg 6.1.1, it was
 * decoded (`ffmpeg -i hot_roadway_remake_bpm160.mp3 -f s16le -c:a pcm_s16le
 * pcm.raw`), then encoded (`ffmpeg -f s16le -ar 44100 -ac 2 -i pcm.raw -c:a
 * libmp3lame -b:a 192k -write_xing 1 -id3v2_version 0 -map_metadata -1
 * hot-roadway.mp3`), giving 2,881,409 bytes, SHA-256
 * 9635d236e299956c9485f0e879e0464d96084054ddf178b5b045a778a448ac68.
 */
export const MUSIC = {
  title: "Hot Roadway [Remake]",
  author: "MintoDog",
  authorPage: "https://opengameart.org/users/mintodog",
  page: "https://opengameart.org/content/hot-roadway-remake",
  licence: "CC0",
  licencePage: "https://creativecommons.org/publicdomain/zero/1.0/",
  url: "/audio/hot-roadway.mp3",
} as const;

/**
 * The loop: 80 bars at 160 bpm, exactly 120 s, 5,292,000 samples at 44.1 kHz.
 * Its end runs into its start without a jump: the last sample is as close to
 * the first as two neighbouring samples usually are, and the music is as loud
 * in its last second as in its first. The MP3 encoder delayed it by 576
 * samples and padded it by 864 to whole frames, as the file's gapless playback
 * tag records. Chromium honours the tag and decodes exactly the loop. A
 * decoder that doesn't keeps the delay (adding some of its own) and ends with
 * the padding after the music, so the loop starts wherever the music does,
 * before that padding.
 */
const LOOP_SECONDS = 5_292_000 / 44_100;
const TRAILING_PADDING_SECONDS = 864 / 44_100;

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
