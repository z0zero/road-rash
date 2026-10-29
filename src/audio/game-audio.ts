import type { GameSession, SessionState } from "@/game/session";
import { createMixer, type Mixer } from "./mixer";
import { fetchMusic, MusicLoop } from "./music";

/** What the sound follows: the session's screens and settings. */
export type SoundSource = Pick<GameSession, "getState" | "subscribe">;

/** The game's sound. */
export interface GameAudio {
  /**
   * Creates the audio context, or resumes it. Call it straight from a click
   * that starts a race (Start Race, Restart): browsers only let sound start
   * from a click or a key press. Never throws: if the browser blocks sound,
   * the game carries on without it.
   */
  unlock(): void;
  /** Stops everything and lets go of the browser's audio. */
  dispose(): void;
}

/** The music's level while the game is paused: it ducks under the pause menu. */
const PAUSED_MUSIC_LEVEL = 0.3;

/**
 * Starts the game's sound. Call it once the title screen is up: it fetches the
 * music straight away, so the music is ready when the race starts. Nothing
 * plays until `unlock`.
 */
export function startGameAudio(session: SoundSource): GameAudio {
  const loading = new AbortController();
  const musicBytes = fetchMusic(loading.signal);
  let sound: Sound | null = null;

  /** Runs `action` on the sound, if there is any; if the sound breaks, the game carries on without it. */
  const withSound = (action: (sound: Sound) => void) => {
    if (!sound) return;
    try {
      action(sound);
    } catch (error) {
      console.warn("The game's sound stopped working, so the game carries on without it.", error);
      sound.close();
      sound = null;
    }
  };

  const stopFollowing = session.subscribe(() => withSound((sound) => sound.follow(session.getState())));
  const followVisibility = () => withSound((sound) => sound.setAudible(!document.hidden));
  document.addEventListener("visibilitychange", followVisibility);

  return {
    unlock() {
      if (loading.signal.aborted) return;
      if (!sound) {
        sound = Sound.create();
        if (!sound) return;
        const context = sound.context;
        void musicBytes
          .then((bytes) => (bytes ? context.decodeAudioData(bytes) : null))
          .catch(() => null)
          .then((buffer) => {
            if (buffer) withSound((sound) => sound.music.setBuffer(buffer));
          });
      }
      withSound((sound) => {
        sound.setAudible(true);
        sound.follow(session.getState());
      });
    },
    dispose() {
      loading.abort();
      stopFollowing();
      document.removeEventListener("visibilitychange", followVisibility);
      sound?.close();
      sound = null;
    },
  };
}

/** Everything that plays, on one audio context. */
class Sound {
  readonly music: MusicLoop;
  private readonly mixer: Mixer;

  private constructor(readonly context: AudioContext) {
    this.mixer = createMixer(context);
    this.music = new MusicLoop(context, this.mixer.music);
  }

  /** A new audio context and everything on it, or null where the browser refuses one. */
  static create(): Sound | null {
    let context: AudioContext;
    try {
      context = new AudioContext({ latencyHint: "interactive" });
    } catch {
      return null;
    }
    try {
      return new Sound(context);
    } catch {
      void context.close().catch(() => undefined);
      return null;
    }
  }

  /** Plays what the screen calls for, at the player's volumes. */
  follow({ screen, settings }: SessionState) {
    this.mixer.setVolumes(settings);
    switch (screen) {
      case "racing":
      case "results":
        this.music.play();
        this.mixer.setLevels(1, 1);
        break;
      case "paused":
        this.music.play();
        this.mixer.setLevels(PAUSED_MUSIC_LEVEL, 0);
        break;
      default:
        this.music.stop();
        this.mixer.setLevels(1, 1);
    }
  }

  /** Resumes the audio context, or suspends it while the game can't be seen. */
  setAudible(audible: boolean) {
    const change = audible ? this.context.resume() : this.context.suspend();
    void change.catch(() => undefined);
  }

  close() {
    void this.context.close().catch(() => undefined);
  }
}
