import type { GameSession, RaceView, Screen, SessionState } from "@/game/session";
import { PLAYER, STEP_SECONDS, type RaceSnapshot, type RiderSnapshot } from "@/race";
import { EngineSound, OPPONENT_ENGINE, PLAYER_ENGINE } from "./engine";
import { createMixer, type Mixer } from "./mixer";
import { fetchMusic, MusicLoop } from "./music";
import { clamp, createKit, type Kit } from "./synth";

/** What the sound follows: the session's screens and settings, and the race as it is drawn each frame. */
export type SoundSource = Pick<GameSession, "getState" | "subscribe" | "onFrame">;

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

/** The nearest opponent's engine is heard within this many metres of the player. */
const RIVAL_EARSHOT = 60;

/** The speed of sound, metres per second, for the Doppler shift of a passing opponent's engine. */
const SPEED_OF_SOUND = 343;

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
  const stopHearingFrames = session.onFrame((view) => withSound((sound) => sound.frame(view)));
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
      stopHearingFrames();
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
  private readonly kit: Kit;
  private readonly engine: EngineSound;
  /** The engine of the opponent nearest the player. */
  private readonly rivalEngine: EngineSound;
  private rival: number | null = null;
  private screen: Screen = "title";
  /** The snapshot the last frame heard, and how fast the player's and the rival's bikes were gaining speed then (m/s²). */
  private heard: RaceSnapshot | null = null;
  private acceleration = 0;
  private rivalAcceleration = 0;

  private constructor(readonly context: AudioContext) {
    this.mixer = createMixer(context);
    this.music = new MusicLoop(context, this.mixer.music);
    this.kit = createKit(context);
    this.engine = new EngineSound(this.kit, this.mixer.effects, PLAYER_ENGINE);
    this.rivalEngine = new EngineSound(this.kit, this.mixer.effects, OPPONENT_ENGINE);
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
    this.screen = screen;
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

  /** Follows the race as it is drawn: the engines. */
  frame({ previous, current }: RaceView) {
    const player = current.riders[PLAYER];
    const rival = nearestOpponent(current, player);
    if (current !== this.heard) {
      // A new step: how fast the bikes are gaining or losing speed.
      this.acceleration = smooth(this.acceleration, accelerationOf(previous, player));
      this.rivalAcceleration = rival ? smooth(this.rivalAcceleration, accelerationOf(previous, rival)) : 0;
      this.heard = current;
    }
    // The engines run while the race is on, and fade out once the player's race is over.
    const racing = this.screen === "racing" || this.screen === "paused";
    this.engine.follow(player.speed, this.acceleration, racing ? 1 : 0);
    if ((rival?.id ?? null) !== this.rival) this.rivalEngine.reset();
    this.rival = rival?.id ?? null;
    if (!rival || !racing) {
      this.rivalEngine.follow(0, 0, 0);
      return;
    }
    const along = rival.distance - player.distance;
    const across = rival.offset - player.offset;
    const distance = Math.hypot(along, across);
    // Higher while it comes up on the player, lower as it pulls away.
    const closing = -Math.sign(along) * (rival.speed - player.speed);
    const doppler = 1 + clamp(closing / SPEED_OF_SOUND, -0.08, 0.08);
    const loudness = 1 / (1 + (distance / 8) ** 2);
    this.rivalEngine.follow(rival.speed, this.rivalAcceleration, loudness, panFor(along, across), doppler);
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

/** The opponent nearest the player within earshot, or null. */
function nearestOpponent(race: RaceSnapshot, player: RiderSnapshot): RiderSnapshot | null {
  let nearest: RiderSnapshot | null = null;
  let nearestDistance = RIVAL_EARSHOT;
  for (const rider of race.riders) {
    if (rider.id === PLAYER) continue;
    const distance = Math.hypot(rider.distance - player.distance, rider.offset - player.offset);
    if (distance < nearestDistance) {
      nearest = rider;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** How fast `rider` gained speed over the last step, m/s². */
function accelerationOf(previous: RaceSnapshot, rider: RiderSnapshot): number {
  const before = previous.riders[rider.id];
  return before ? (rider.speed - before.speed) / STEP_SECONDS : 0;
}

/** Eases a running value towards each new reading, so one odd step doesn't jolt the sound. */
function smooth(value: number, reading: number): number {
  return Number.isFinite(reading) ? value + (reading - value) * 0.25 : value;
}

/**
 * How far left or right a sound `along` metres ahead and `across` metres to
 * the right of the player is heard, from -1 (left) to 1 (right).
 */
function panFor(along: number, across: number): number {
  return (0.75 * across) / Math.max(Math.hypot(along, across), 2);
}
