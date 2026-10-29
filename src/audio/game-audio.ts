import type { GameSession, RaceView, Screen, SessionState } from "@/game/session";
import {
  PLAYER,
  STEP_SECONDS,
  type RaceEvent,
  type RaceSnapshot,
  type RiderOrCop,
  type RiderSnapshot,
} from "@/race";
import { EngineSound, OPPONENT_ENGINE, PLAYER_ENGINE } from "./engine";
import { createMixer, type Mixer } from "./mixer";
import { fetchMusic, MusicLoop } from "./music";
import {
  playClubHit,
  playCountdownBeep,
  playCrash,
  playFinish,
  playGrab,
  playKick,
  playPunch,
  playSwing,
  Gravel,
  Siren,
  Skid,
} from "./sounds";
import { clamp, createKit, type Kit } from "./synth";

/** What the sound follows: the session's screens and settings, the race's events, and the race as it is drawn. */
export type SoundSource = Pick<GameSession, "getState" | "subscribe" | "onRaceEvent" | "onFrame" | "view">;

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

/** A sound this many metres from the player is heard at half strength; further off, fainter still. */
const HALF_LOUDNESS_METRES = 10;

/** Sounds fainter than this aren't worth playing. */
const FAINTEST = 0.02;

/** A crash this fast (m/s) sounds as hard as a crash can; slower ones are softer, down to a floor. */
const HARDEST_CRASH_SPEED = 30;

/** While the player is off the bike, it lies ticking over at this share of the engine's loudness. */
const FALLEN_ENGINE_LOUDNESS = 0.4;

/** How deep the music and the riding sounds dip under a landed hit, and under the hardest crash (0 to 1). */
const HIT_DUCK = 0.45;
const CRASH_DUCK = 0.6;

/** Off the road, gravel crunches at full strength from this speed (m/s). */
const LOUDEST_GRAVEL_SPEED = 25;

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
  const stopHearingEvents = session.onRaceEvent((event) =>
    withSound((sound) => sound.hear(event, session.view.current)),
  );
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
      stopHearingEvents();
      stopHearingFrames();
      document.removeEventListener("visibilitychange", followVisibility);
      sound?.close();
      sound = null;
    },
  };
}

/** How the player hears a sound: how loud (0 to 1) and how far left or right (-1 to 1). */
interface Hearing {
  readonly loudness: number;
  readonly pan: number;
}

/** Everything that plays, on one audio context. */
class Sound {
  readonly music: MusicLoop;
  private readonly mixer: Mixer;
  private readonly kit: Kit;
  private readonly engine: EngineSound;
  /** The engine of the opponent nearest the player. */
  private readonly rivalEngine: EngineSound;
  private readonly siren: Siren;
  private readonly skid: Skid;
  private readonly gravel: Gravel;
  private screen: Screen = "title";
  private rival: number | null = null;
  /** The snapshot the last frame heard, and how fast the player's and the rival's bikes were gaining speed then (m/s²). */
  private heard: RaceSnapshot | null = null;
  private acceleration = 0;
  private rivalAcceleration = 0;
  /** The countdown's last call (3, 2, 1, then 0), so each beeps once; null before a race's countdown is heard. */
  private countdownCall: number | null = null;
  private lastCountdown = 0;
  private lastClock = 0;
  /** The cops near the player, whose siren sounds. */
  private readonly copsNear = new Set<number>();

  private constructor(readonly context: AudioContext) {
    this.mixer = createMixer(context);
    this.music = new MusicLoop(context, this.mixer.music);
    this.kit = createKit(context);
    this.engine = new EngineSound(this.kit, this.mixer.riding, PLAYER_ENGINE);
    this.rivalEngine = new EngineSound(this.kit, this.mixer.riding, OPPONENT_ENGINE);
    this.skid = new Skid(this.kit, this.mixer.riding);
    this.gravel = new Gravel(this.kit, this.mixer.riding);
    this.siren = new Siren(this.kit, this.mixer.effects);
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

  /** Plays what a race event calls for, while the race is on screen. */
  hear(event: RaceEvent, race: RaceSnapshot) {
    if (this.screen !== "racing") return;
    switch (event.type) {
      case "race-started":
        playCountdownBeep(this.kit, this.mixer.effects, true);
        break;
      case "attack-thrown":
        this.play(hearingOf(race, event.attacker, event.target), (out, loudness) =>
          playSwing(this.kit, out, loudness, event.kind === "club-swing"),
        );
        break;
      case "attack-landed": {
        const play = { punch: playPunch, kick: playKick, "club-swing": playClubHit }[event.kind];
        this.play(hearingOf(race, event.target, event.attacker), (out, loudness) => {
          play(this.kit, out, loudness);
          this.mixer.duck(HIT_DUCK * loudness);
        });
        break;
      }
      case "weapon-stolen":
        this.play(hearingOf(race, event.by, event.from), (out, loudness) => playGrab(this.kit, out, loudness));
        break;
      case "crash": {
        const force = clamp(event.impactSpeed / HARDEST_CRASH_SPEED, 0.35, 1);
        this.play(hearingOf(race, { kind: "rider", id: event.rider }, null), (out, loudness) => {
          playCrash(this.kit, out, force * loudness);
          this.mixer.duck(CRASH_DUCK * force * loudness);
        });
        break;
      }
      case "rider-finished":
        if (event.rider === PLAYER) playFinish(this.kit, this.mixer.effects);
        break;
      case "cop-near":
        this.copsNear.add(event.cop);
        this.siren.setOn(true);
        break;
      case "cop-gone":
        this.copsNear.delete(event.cop);
        this.siren.setOn(this.copsNear.size > 0);
        break;
    }
  }

  /** Follows the race as it is drawn: the countdown, the engines, skids and gravel. */
  frame({ track, previous, current }: RaceView) {
    const racing = this.screen === "racing" || this.screen === "paused";
    // A race begins afresh when its countdown or clock goes back; with no race on, there's nothing to hear.
    if (!racing || current.countdown > this.lastCountdown || current.clock < this.lastClock) this.forgetRace();
    this.lastCountdown = current.countdown;
    this.lastClock = current.clock;

    const call = Math.ceil(current.countdown);
    if (racing && call > 0 && call !== this.countdownCall) playCountdownBeep(this.kit, this.mixer.effects, false);
    if (racing) this.countdownCall = call;

    const player = current.riders[PLAYER];
    const rival = racing ? nearestOpponent(current, player) : null;
    if (current !== this.heard) {
      // A new step: how fast the bikes are gaining or losing speed.
      this.acceleration = smooth(this.acceleration, accelerationOf(previous, player));
      this.rivalAcceleration = rival ? smooth(this.rivalAcceleration, accelerationOf(previous, rival)) : 0;
      this.heard = current;
    }

    // The engines run while the race is on, and fade out once the player's race is over.
    const riding = player.crash === null;
    if (riding) this.engine.follow(player.speed, this.acceleration, racing ? 1 : 0);
    else this.engine.follow(0, 0, racing ? FALLEN_ENGINE_LOUDNESS : 0);
    // Braking hard squeals the tyres on the road; off it, the gravel crunches.
    const offRoad = Math.abs(player.offset) > track.roadHalfWidth;
    const skid = racing && riding && !offRoad ? skidding(player.speed, -this.acceleration) : 0;
    this.skid.setIntensity(skid);
    this.gravel.setIntensity(racing && riding && offRoad ? player.speed / LOUDEST_GRAVEL_SPEED : 0);

    if ((rival?.id ?? null) !== this.rival) this.rivalEngine.reset();
    this.rival = rival?.id ?? null;
    if (!rival) {
      this.rivalEngine.follow(0, 0, 0);
      return;
    }
    const along = rival.distance - player.distance;
    const across = rival.offset - player.offset;
    // Higher while it comes up on the player, lower as it pulls away.
    const closing = -Math.sign(along) * (rival.speed - player.speed);
    const doppler = 1 + clamp(closing / SPEED_OF_SOUND, -0.08, 0.08);
    const loudness = 1 / (1 + (Math.hypot(along, across) / 8) ** 2);
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

  /** Plays a sound as the player hears it, unless it's too faint to matter. */
  private play(hearing: Hearing, sound: (out: AudioNode, loudness: number) => void) {
    if (hearing.loudness < FAINTEST) return;
    const panner = this.context.createStereoPanner();
    panner.pan.value = hearing.pan;
    panner.connect(this.mixer.effects);
    sound(panner, hearing.loudness);
  }

  /** Forgets the race that was on: its countdown and its cops. */
  private forgetRace() {
    this.countdownCall = null;
    if (this.copsNear.size > 0) {
      this.copsNear.clear();
      this.siren.setOn(false);
    }
  }
}

/**
 * How the player hears something happening to `subject`, with `other` the
 * rider or cop at the other end of it, if any: their own fights at full
 * strength from the other rider's side, and everyone else's fainter the
 * further off they are.
 */
function hearingOf(race: RaceSnapshot, subject: RiderOrCop, other: RiderOrCop | null): Hearing {
  const player = race.riders[PLAYER];
  const isPlayer = (who: RiderOrCop | null) => who?.kind === "rider" && who.id === PLAYER;
  const riderOf = (who: RiderOrCop | null) => (who?.kind === "rider" ? race.riders[who.id] : undefined);
  if (isPlayer(subject) || isPlayer(other)) {
    const them = riderOf(isPlayer(subject) ? other : subject);
    return { loudness: 1, pan: them ? panFor(them.distance - player.distance, them.offset - player.offset) : 0 };
  }
  // Cops aren't in the snapshot: a cop's fight is heard where the rider in it is.
  const where = riderOf(subject) ?? riderOf(other);
  if (!where) return { loudness: 0.5, pan: 0 };
  const along = where.distance - player.distance;
  const across = where.offset - player.offset;
  return { loudness: 1 / (1 + (Math.hypot(along, across) / HALF_LOUDNESS_METRES) ** 2), pan: panFor(along, across) };
}

/** The opponent on their bike nearest the player within earshot, or null. */
function nearestOpponent(race: RaceSnapshot, player: RiderSnapshot): RiderSnapshot | null {
  let nearest: RiderSnapshot | null = null;
  let nearestDistance = RIVAL_EARSHOT;
  for (const rider of race.riders) {
    if (rider.id === PLAYER || rider.crash !== null || rider.status !== "racing") continue;
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

/** How hard the tyres skid, 0 to 1: braking hard at speed squeals them, harder and faster, louder. */
function skidding(speed: number, deceleration: number): number {
  return clamp((deceleration - 8) / 6, 0, 1) * clamp((speed - 6) / 20, 0, 1);
}

/**
 * How far left or right a sound `along` metres ahead and `across` metres to
 * the right of the player is heard, from -1 (left) to 1 (right).
 */
function panFor(along: number, across: number): number {
  return (0.75 * across) / Math.max(Math.hypot(along, across), 2);
}
