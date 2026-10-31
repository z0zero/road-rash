import type { GameSession, RaceView, Screen, SessionState } from "@/game/session";
import { clamp } from "@/math";
import type { Settings } from "@/save-data/save-data";
import {
  isPlayer,
  PLAYER,
  STEP_SECONDS,
  type CopSnapshot,
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
  playKnockDown,
  playPunch,
  playSwing,
  Gravel,
  Siren,
  Skid,
} from "./sounds";
import { createKit, type Kit } from "./synth";

/** What the sound follows: the session's screens and settings, the race's events, and the race as it is drawn. */
export type SoundSource = Pick<GameSession, "getState" | "subscribe" | "onRaceEvent" | "onFrame" | "view">;

/** The game's sound. */
export interface GameAudio {
  /**
   * Creates the audio context, or resumes it. Call it straight from a click
   * that starts a race (Start Race, Restart): browsers only let sound start
   * from a click or a key press. Where a gamepad pressed the button, a browser
   * may keep the sound locked until the next key press or click. Never
   * throws: if the browser blocks sound, the game carries on without it.
   */
  unlock(): void;
  /** Stops everything and lets go of the browser's audio. */
  dispose(): void;
}

/**
 * A browser that lets the sound start does so at once; one still holding it
 * back this long after a race asked for it without a key press or click
 * (milliseconds) is keeping it locked until one. One still holding it back
 * this long after a key press or click asked for it isn't waiting for one.
 */
const LOCKED_AFTER_MS = 1000;

/**
 * The input that browsers let sound start from: a key press, a click or a
 * tap. (A gamepad's press counts in some browsers, but not in Safari, nor in
 * Firefox before 155.)
 */
const GESTURES = ["keydown", "mousedown", "pointerup", "touchend"] as const;

/** The music's level while the game is paused: it ducks under the pause menu. */
const PAUSED_MUSIC_LEVEL = 0.3;

/** The speed of sound, metres per second, for the Doppler shift of a passing opponent's engine. */
const SPEED_OF_SOUND = 343;

/** A sound this many metres from the player is heard at half strength; further off, fainter still. */
const HALF_LOUDNESS_METRES = 10;
/** The nearest opponent's or cop's engine is heard at half strength this many metres from the player. */
const ENGINE_HALF_LOUDNESS_METRES = 8;
/** A cop's siren is heard at half strength this many metres from the player, and still heard at the cop alert's edge. */
const SIREN_HALF_LOUDNESS_METRES = 60;

/** Sounds fainter than this aren't worth playing. */
const FAINTEST = 0.02;

/** A crash this fast (m/s) sounds as hard as a crash can; slower ones are softer... */
const HARDEST_CRASH_SPEED = 30;
/** ...down to this share of the hardest. */
const SOFTEST_CRASH = 0.35;

/** While the player is off the bike, it lies ticking over at this share of the engine's loudness. */
const FALLEN_ENGINE_LOUDNESS = 0.4;

/** How deep the music and the riding sounds dip under a landed hit, and under the hardest crash (0 to 1). */
const HIT_DUCK = 0.45;
const CRASH_DUCK = 0.6;

/** The sound each kind of attack makes when it lands. */
const LANDING_SOUNDS = { punch: playPunch, kick: playKick, "club-swing": playClubHit } as const;

/** The player, as the race names whoever an event is about. */
const THE_PLAYER: RiderOrCop = { kind: "rider", id: PLAYER };

/** The sound of someone going down: off their bike in a crash, knocked off it as a cop, or knocked down by a car. */
const GOING_DOWN_SOUNDS = { crash: playCrash, "cop-knocked-off": playCrash, "knocked-down": playKnockDown } as const;

/** Off the road, gravel crunches at full strength from this speed (m/s). */
const LOUDEST_GRAVEL_SPEED = 25;

/**
 * Starts the game's sound. Call it once the title screen is up: it fetches the
 * music straight away, so the music is ready when the race starts. Nothing
 * plays until `unlock`. A browser can keep the sound locked even then, as
 * some do when a gamepad starts the race: `onLockChange` hears when it does,
 * so that the player can be told a key press or click turns it on, and when
 * the sound starts after all, from the next one. It never says so to a player
 * who would hear nothing anyway, with the volumes all the way down, nor after
 * a key press or click has failed to start the sound: such a browser isn't
 * waiting for one.
 */
export function startGameAudio(session: SoundSource, onLockChange: (locked: boolean) => void = () => {}): GameAudio {
  const loading = new AbortController();
  const musicBytes = fetchMusic(loading.signal);
  let sound: Sound | null = null;
  /** Set once the sound has broken: the game carries on without it from then on. */
  let broken = false;
  /** Whether the browser is keeping the sound locked, as `onLockChange` last heard. */
  let locked = false;
  /** Set once a key press or click has asked for the sound and the browser still held it back: it never says it is locked again. */
  let notWaitingForAKey = false;
  /** Checks whether the browser held the sound back from a race asked for without a key press or click... */
  let lockCheck: number | undefined;
  /** ...and from a key press or click; undefined when none is due. */
  let keyCheck: number | undefined;

  const setLocked = (now: boolean) => {
    const told = now && !notWaitingForAKey && wouldBeHeard(session.getState().settings);
    if (told === locked) return;
    locked = told;
    onLockChange(told);
  };
  /** Whether the browser is holding the sound back: there is sound, the page can be seen, but it isn't playing. */
  const heldBack = () => sound !== null && !document.hidden && sound.context.state !== "running";

  /** Runs `action` on the sound, if there is any; if the sound breaks, the game carries on without it. */
  const withSound = (action: (sound: Sound) => void) => {
    if (!sound) return;
    try {
      action(sound);
    } catch (error) {
      console.warn("The game's sound stopped working, so the game carries on without it.", error);
      sound.close();
      sound = null;
      broken = true;
      setLocked(false);
    }
  };

  const stopFollowing = session.subscribe(() => withSound((sound) => sound.follow(session.getState())));
  const stopHearingEvents = session.onRaceEvent((event) =>
    withSound((sound) => sound.hear(event, session.view.current)),
  );
  const stopHearingFrames = session.onFrame((view) => withSound((sound) => sound.frame(view)));
  const followVisibility = () => withSound((sound) => sound.setAudible(!document.hidden));
  document.addEventListener("visibilitychange", followVisibility);
  /**
   * A key press or click while the browser holds the sound back asks it again
   * to play it: now it may. If it still doesn't, it isn't waiting for one.
   */
  const askAgain = () => {
    if (!heldBack()) return;
    withSound((sound) => sound.setAudible(true));
    keyCheck ??= window.setTimeout(() => {
      keyCheck = undefined;
      if (!heldBack()) return;
      notWaitingForAKey = true;
      setLocked(false);
    }, LOCKED_AFTER_MS);
  };
  for (const gesture of GESTURES) window.addEventListener(gesture, askAgain, { capture: true, passive: true });

  return {
    unlock() {
      if (broken || loading.signal.aborted) return;
      if (!sound) {
        sound = Sound.create();
        if (!sound) return;
        const context = sound.context;
        context.addEventListener("statechange", () => {
          if (context.state === "running") setLocked(false);
        });
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
      window.clearTimeout(lockCheck);
      // Asked for from a key press or click, the sound plays now if the browser ever lets it. Asked for without
      // one, as from a gamepad's press, it may be kept locked until one.
      if (hasUserActivation()) setLocked(false);
      else {
        // Still locked from the last race, it is told so again at once, unless the volumes have gone down since.
        setLocked(locked);
        lockCheck = window.setTimeout(() => setLocked(heldBack()), LOCKED_AFTER_MS);
      }
    },
    dispose() {
      loading.abort();
      stopFollowing();
      stopHearingEvents();
      stopHearingFrames();
      document.removeEventListener("visibilitychange", followVisibility);
      for (const gesture of GESTURES) window.removeEventListener(gesture, askAgain, { capture: true });
      window.clearTimeout(lockCheck);
      window.clearTimeout(keyCheck);
      sound?.close();
      sound = null;
    },
  };
}

/**
 * Whether the page has the player's activation, which browsers let sound
 * start from: a key press, click or tap in the last moment. A gamepad's press
 * gives it in some browsers, but not in Safari, nor in Firefox before 155.
 * Where the browser can't say, it hasn't.
 */
function hasUserActivation(): boolean {
  return navigator.userActivation?.isActive === true;
}

/** Whether anything would be heard at the player's volumes: not with the master volume, or both the others, at 0. */
function wouldBeHeard({ masterVolume, musicVolume, effectsVolume }: Settings): boolean {
  return masterVolume > 0 && (musicVolume > 0 || effectsVolume > 0);
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
  /** The engine of the opponent or cop nearest the player. */
  private readonly opponentEngine: EngineSound;
  private readonly siren: Siren;
  private readonly skid: Skid;
  private readonly gravel: Gravel;
  private screen: Screen = "title";
  /** The opponent or cop whose engine is heard. */
  private nearest: RiderOrCop | null = null;
  /**
   * The snapshot the last frame heard, and how fast the player's and the
   * nearest opponent's or cop's bikes were gaining speed then (m/s²).
   */
  private heard: RaceSnapshot | null = null;
  private acceleration = 0;
  private opponentAcceleration = 0;
  /** The countdown's last call (3, 2, 1, then 0), so each beeps once; null before a race's countdown is heard. */
  private countdownCall: number | null = null;
  private lastCountdown = 0;
  private lastClock = 0;

  private constructor(readonly context: AudioContext) {
    this.mixer = createMixer(context);
    this.music = new MusicLoop(context, this.mixer.music);
    this.kit = createKit(context);
    this.engine = new EngineSound(this.kit, this.mixer.riding, PLAYER_ENGINE);
    this.opponentEngine = new EngineSound(this.kit, this.mixer.riding, OPPONENT_ENGINE);
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
        const play = LANDING_SOUNDS[event.kind];
        this.play(hearingOf(race, event.target, event.attacker), (out, loudness) => {
          play(this.kit, out, loudness);
          this.mixer.duck(HIT_DUCK * loudness);
        });
        break;
      }
      case "weapon-stolen":
        this.play(hearingOf(race, event.by, event.from), (out, loudness) => playGrab(this.kit, out, loudness));
        break;
      case "crash":
      case "cop-knocked-off":
      case "knocked-down": {
        const who: RiderOrCop =
          event.type === "cop-knocked-off" ? { kind: "cop", id: event.cop } : { kind: "rider", id: event.rider };
        const force = clamp(event.impactSpeed / HARDEST_CRASH_SPEED, SOFTEST_CRASH, 1);
        const play = GOING_DOWN_SOUNDS[event.type];
        this.play(hearingOf(race, who, null), (out, loudness) => {
          play(this.kit, out, force * loudness);
          this.mixer.duck(CRASH_DUCK * force * loudness);
        });
        break;
      }
      case "rider-finished":
        if (event.rider === PLAYER) playFinish(this.kit, this.mixer.effects);
        break;
    }
  }

  /** Follows the race as it is drawn: the countdown, the engines, skids and gravel, and the siren. */
  frame({ previous, current }: RaceView) {
    const racing = this.screen === "racing" || this.screen === "paused";
    // A race begins afresh when its countdown or clock goes back; with no race on, there's nothing to hear.
    if (!racing || current.countdown > this.lastCountdown || current.clock < this.lastClock) this.forgetRace();
    this.lastCountdown = current.countdown;
    this.lastClock = current.clock;

    const call = Math.ceil(current.countdown);
    if (racing && call > 0 && call !== this.countdownCall) playCountdownBeep(this.kit, this.mixer.effects, false);
    if (racing) this.countdownCall = call;

    const player = current.riders[PLAYER];
    // The engine heard beside the player's is that of the opponent or cop the race says is nearest them.
    const nearest = racing ? current.nearestOpponentOrCop : null;
    const opponent = nearest ? whereIs(current, nearest) : null;
    if (current !== this.heard) {
      // A new step: how fast the bikes are gaining or losing speed.
      this.acceleration = smooth(this.acceleration, accelerationOf(previous, current, THE_PLAYER));
      this.opponentAcceleration = nearest
        ? smooth(this.opponentAcceleration, accelerationOf(previous, current, nearest))
        : 0;
      this.heard = current;
    }

    // The engines run while the race is on, and fade out once the player's race is over.
    const onBike = player.crash === null;
    if (onBike) this.engine.follow(player.speed, this.acceleration, racing ? 1 : 0);
    else this.engine.follow(0, 0, racing ? FALLEN_ENGINE_LOUDNESS : 0);
    // Braking hard squeals the tyres on the road; off it, the gravel crunches.
    const skid = racing && onBike && !player.offRoad ? skidding(player.speed, -this.acceleration) : 0;
    this.skid.setIntensity(skid);
    this.gravel.setIntensity(racing && onBike && player.offRoad ? player.speed / LOUDEST_GRAVEL_SPEED : 0);
    // The siren sounds from the nearest cop near the player while the race is ridden. Paused, it fades
    // out behind the muted effects, so that none of it is left to sound over a race restarted from the
    // pause menu, or over the title.
    const siren = this.screen === "racing" ? sirenOf(current) : null;
    this.siren.follow(siren?.loudness ?? 0, siren?.pan, siren?.doppler);

    if (!isSameOne(nearest, this.nearest)) this.opponentEngine.reset();
    this.nearest = nearest;
    if (!opponent) {
      this.opponentEngine.follow(0, 0, 0);
      return;
    }
    const along = opponent.distance - player.distance;
    const across = opponent.offset - player.offset;
    const loudness = loudnessAt(along, across, ENGINE_HALF_LOUDNESS_METRES);
    const doppler = dopplerOf(along, opponent.speed, player.speed);
    this.opponentEngine.follow(opponent.speed, this.opponentAcceleration, loudness, panFor(along, across), doppler);
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

  /** Forgets the race that was on: its countdown. */
  private forgetRace() {
    this.countdownCall = null;
  }
}

/**
 * How the player hears something happening to `subject`, with `other` the
 * rider or cop at the other end of it, if any: their own fights at full
 * strength from the other side's direction, and everyone else's fainter the
 * further off they are.
 */
function hearingOf(race: RaceSnapshot, subject: RiderOrCop, other: RiderOrCop | null): Hearing {
  const player = race.riders[PLAYER];
  if (isPlayer(subject) || isPlayer(other)) {
    const them = whereIs(race, isPlayer(subject) ? other : subject);
    return { loudness: 1, pan: them ? panFor(them.distance - player.distance, them.offset - player.offset) : 0 };
  }
  const where = whereIs(race, subject);
  if (!where) return { loudness: 0.5, pan: 0 };
  const along = where.distance - player.distance;
  const across = where.offset - player.offset;
  return { loudness: loudnessAt(along, across, HALF_LOUDNESS_METRES), pan: panFor(along, across) };
}

/**
 * How the player hears the siren of the nearest cop near them in `race`, from
 * where the cop is: louder as it closes, from its side, and its pitch shifted
 * as it comes up or drops back. It is faint at the edge of the cop alert's
 * range, but heard wherever the HUD shows the alert. Null when no cop is near.
 */
function sirenOf(race: RaceSnapshot): (Hearing & { readonly doppler: number }) | null {
  const player = race.riders[PLAYER];
  const apart = (cop: CopSnapshot) => Math.hypot(cop.distance - player.distance, cop.offset - player.offset);
  let nearest: CopSnapshot | null = null;
  for (const cop of race.cops) {
    if (cop.near && (!nearest || apart(cop) < apart(nearest))) nearest = cop;
  }
  if (!nearest) return null;
  const along = nearest.distance - player.distance;
  const across = nearest.offset - player.offset;
  return {
    loudness: loudnessAt(along, across, SIREN_HALF_LOUDNESS_METRES),
    pan: panFor(along, across),
    doppler: dopplerOf(along, nearest.speed, player.speed),
  };
}

/** The rider or cop `who` in `race`, if there is one. */
function whereIs(race: RaceSnapshot, who: RiderOrCop | null): RiderSnapshot | CopSnapshot | undefined {
  if (who === null) return undefined;
  return who.kind === "rider" ? race.riders[who.id] : race.cops[who.id];
}

/** Whether `a` and `b` are the same rider or cop, or both no one. */
function isSameOne(a: RiderOrCop | null, b: RiderOrCop | null): boolean {
  return a?.kind === b?.kind && a?.id === b?.id;
}

/**
 * How loud a sound `along` metres ahead of the player and `across` metres to
 * their right is heard: in full beside them, at half strength
 * `halfLoudnessMetres` away, and fainter still further off.
 */
function loudnessAt(along: number, across: number, halfLoudnessMetres: number): number {
  return 1 / (1 + (Math.hypot(along, across) / halfLoudnessMetres) ** 2);
}

/**
 * How much higher something `along` metres ahead of the player (behind, if
 * negative), going at `speed` (m/s) to their `playerSpeed`, sounds: higher
 * while it comes up on the player, lower as it pulls away (1 for neither).
 */
function dopplerOf(along: number, speed: number, playerSpeed: number): number {
  const closing = -Math.sign(along) * (speed - playerSpeed);
  return 1 + clamp(closing / SPEED_OF_SOUND, -0.08, 0.08);
}

/** How fast the bike of the rider or cop `who` gained speed over the last step, m/s². */
function accelerationOf(previous: RaceSnapshot, current: RaceSnapshot, who: RiderOrCop): number {
  const before = whereIs(previous, who);
  const now = whereIs(current, who);
  return before && now ? (now.speed - before.speed) / STEP_SECONDS : 0;
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
