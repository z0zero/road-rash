import {
  createRace,
  NO_INPUT,
  STEP_SECONDS,
  type PlayerInput,
  type Race,
  type RaceEvent,
  type RaceResults,
  type RaceSnapshot,
  type Track,
} from "@/race";
import {
  loadSaveData,
  recordRaceResult,
  storeSaveData,
  type PersonalBest,
  type SaveData,
  type SaveStorage,
  type Settings,
} from "@/save-data/save-data";

/** Which screen the game shows. The countdown and the race itself are both "racing". */
export type Screen = "title" | "settings" | "credits" | "controls" | "racing" | "paused" | "results";

/** What React renders from. It changes only on screen changes and settings changes, never per frame. */
export interface SessionState {
  readonly screen: Screen;
  /** The last race's results, while the results screen shows. */
  readonly results: RaceResults | null;
  readonly personalBest: PersonalBest;
  /** Whether the last race set a new best time. */
  readonly newBestTime: boolean;
  /** Whether the last race set a new best position. */
  readonly newBestPosition: boolean;
  /** The player's settings, as saved. */
  readonly settings: Settings;
  /** The seed of the race on now, or last raced: `?seed=` in the page's address plays it again. */
  readonly seed: number;
}

/**
 * What the renderer and HUD draw each frame: the latest two snapshots, and how
 * far between them the frame falls. One object, updated in place every frame.
 */
export interface RaceView {
  readonly track: Track;
  readonly previous: RaceSnapshot;
  readonly current: RaceSnapshot;
  /** 0 draws `previous`, 1 draws `current`. */
  readonly alpha: number;
}

export interface SessionOptions {
  /** The player's input for the next step. */
  readInput(): PlayerInput;
  /** Where save data lives; undefined when the browser offers none. */
  storage: SaveStorage | undefined;
  /** A seed for each new race. */
  newSeed(): number;
  /** The time now, in milliseconds, from any fixed point: it times how long a frame spends on the fast-forward. */
  now(): number;
}

/** A frame longer than this (a hiccup, or a tab coming back) is cut short rather than simulated in full. */
const MAX_FRAME_SECONDS = 0.25;

/**
 * Once the player's race is over, each frame races the rest of the field on
 * towards the finish for about this many milliseconds, so the standings fill
 * in over a few frames instead of the game stalling for one...
 */
const FAST_FORWARD_MS_PER_FRAME = 10;
/** ...a second of race at a time. */
const FAST_FORWARD_STEPS = Math.round(1 / STEP_SECONDS);

/**
 * Frames a new race is drawn for before the session starts stepping it, so
 * that its countdown starts only once the race is on screen. The time passed
 * in for the first frame went by on the previous screen, and the time passed
 * in for the second mostly went on drawing the first, which can take seconds
 * on a modest machine while it compiles shaders. Counting either would eat
 * into the countdown before the player had seen it.
 */
const FRAMES_BEFORE_STEPPING = 2;

/**
 * One player's game: the title screen, races, pausing and results. It steps
 * the race in fixed 1/60 s steps from the frame clock, turns the race's events
 * into screen changes, and keeps the save data. It knows nothing of React or
 * Three.js: the UI subscribes to its state and the renderer reads its view.
 */
export class GameSession {
  private race: Race;
  private readonly frame: { -readonly [K in keyof RaceView]: RaceView[K] };
  private accumulator = 0;
  /** Frames the current race is still to be drawn for before it is stepped; see `FRAMES_BEFORE_STEPPING`. */
  private framesBeforeStepping = FRAMES_BEFORE_STEPPING;
  private saveData: SaveData;
  private state: SessionState;
  private readonly stateListeners = new Set<() => void>();
  private readonly frameListeners = new Set<(view: RaceView) => void>();
  private readonly eventListeners = new Set<(event: RaceEvent) => void>();

  constructor(private readonly options: SessionOptions) {
    this.saveData = loadSaveData(options.storage);
    const seed = options.newSeed();
    this.race = createRace({ seed });
    const snapshot = this.race.snapshot();
    this.frame = { track: this.race.track, previous: snapshot, current: snapshot, alpha: 1 };
    this.state = {
      screen: "title",
      results: null,
      personalBest: this.saveData.personalBest,
      newBestTime: false,
      newBestPosition: false,
      settings: this.saveData.settings,
      seed,
    };
  }

  /** The current state, for React's useSyncExternalStore. */
  getState = (): SessionState => this.state;

  /** Calls `listener` whenever the state changes; returns the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  /** Calls `listener` after every frame, with the view to draw. */
  onFrame(listener: (view: RaceView) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Calls `listener` with every event the race emits while it is played. */
  onRaceEvent(listener: (event: RaceEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  get view(): RaceView {
    return this.frame;
  }

  /** Starts a new race with its countdown, from any screen. */
  startRace = () => {
    const seed = this.loadRace();
    this.setState({ screen: "racing", results: null, newBestTime: false, newBestPosition: false, seed });
  };

  restart = () => this.startRace();

  pause = () => {
    if (this.state.screen === "racing") this.setState({ screen: "paused" });
  };

  resume = () => {
    if (this.state.screen === "paused") this.setState({ screen: "racing" });
  };

  togglePause = () => {
    if (this.state.screen === "racing") this.pause();
    else if (this.state.screen === "paused") this.resume();
  };

  quitToTitle = () => {
    const seed = this.loadRace();
    this.setState({ screen: "title", results: null, newBestTime: false, newBestPosition: false, seed });
  };

  /** Shows the Settings screen; only from the title screen. */
  openSettings = () => {
    if (this.state.screen === "title") this.setState({ screen: "settings" });
  };

  /** Goes back from the Settings screen to the title screen. */
  closeSettings = () => {
    if (this.state.screen === "settings") this.setState({ screen: "title" });
  };

  /** Shows the Credits screen; only from the title screen. */
  openCredits = () => {
    if (this.state.screen === "title") this.setState({ screen: "credits" });
  };

  /** Goes back from the Credits screen to the title screen. */
  closeCredits = () => {
    if (this.state.screen === "credits") this.setState({ screen: "title" });
  };

  /** Shows the Controls screen; only from the title screen. */
  openControls = () => {
    if (this.state.screen === "title") this.setState({ screen: "controls" });
  };

  /** Goes back from the Controls screen to the title screen. */
  closeControls = () => {
    if (this.state.screen === "controls") this.setState({ screen: "title" });
  };

  /** Changes some of the player's settings and saves them. */
  changeSettings = (change: Partial<Settings>) => {
    this.saveData = { ...this.saveData, settings: { ...this.saveData.settings, ...change } };
    storeSaveData(this.options.storage, this.saveData);
    this.setState({ settings: this.saveData.settings });
  };

  /** Moves the game on by `seconds` of real time; call it once per animation frame, just before drawing it. */
  advance(seconds: number) {
    const { screen, results } = this.state;
    if (screen === "results" && results && !results.complete) {
      this.raceTheFieldOn(results);
    } else if (screen === "racing" || screen === "results") {
      if (this.framesBeforeStepping > 0) this.framesBeforeStepping--;
      else this.accumulator += Math.min(Math.max(seconds, 0), MAX_FRAME_SECONDS);
      while (this.accumulator >= STEP_SECONDS) {
        this.accumulator -= STEP_SECONDS;
        this.step(this.state.screen === "racing" ? this.options.readInput() : NO_INPUT);
      }
      this.frame.alpha = this.accumulator / STEP_SECONDS;
    }
    for (const listener of this.frameListeners) listener(this.frame);
  }

  private step(input: PlayerInput) {
    this.race.step(input);
    this.frame.previous = this.frame.current;
    this.frame.current = this.race.snapshot();
    for (const event of this.race.drainEvents()) {
      for (const listener of this.eventListeners) listener(event);
      if (event.type === "player-race-over") {
        this.showResults();
        return;
      }
    }
  }

  /**
   * Shows the results as the player's race ends. Their own result is final at
   * once; the rest of the field is raced to the finish over the next frames
   * (`raceTheFieldOn`), while the view stays as the player's race ended.
   */
  private showResults() {
    const results = this.race.fastForward(0);
    this.race.drainEvents();
    this.frame.previous = this.frame.current;
    const bestBefore = this.saveData.personalBest;
    this.saveData = recordRaceResult(this.saveData, results);
    storeSaveData(this.options.storage, this.saveData);
    this.setState({
      screen: "results",
      results,
      personalBest: this.saveData.personalBest,
      newBestTime: this.saveData.personalBest.time !== bestBefore.time,
      newBestPosition: this.saveData.personalBest.position !== bestBefore.position,
    });
  }

  /**
   * Races the rest of the field on towards the finish for a frame's share of
   * time. The standings shown change only as riders finish or drop out of the
   * race, and once they are complete, since the order of the riders still on
   * the road changes every step; then the view moves on to where the race
   * ended up.
   */
  private raceTheFieldOn(shown: RaceResults) {
    const until = this.options.now() + FAST_FORWARD_MS_PER_FRAME;
    let results = shown;
    do results = this.race.fastForward(FAST_FORWARD_STEPS);
    while (!results.complete && this.options.now() < until);
    this.race.drainEvents();
    if (results.complete) {
      const snapshot = this.race.snapshot();
      this.frame.previous = snapshot;
      this.frame.current = snapshot;
    }
    const settled = ({ standings }: RaceResults) => standings.filter((standing) => standing.status !== "racing").length;
    if (results.complete || settled(results) !== settled(shown)) this.setState({ results });
  }

  /** Loads a new race, ready for its countdown, and returns its seed. */
  private loadRace(): number {
    const seed = this.options.newSeed();
    this.race = createRace({ seed });
    const snapshot = this.race.snapshot();
    this.frame.track = this.race.track;
    this.frame.previous = snapshot;
    this.frame.current = snapshot;
    this.frame.alpha = 1;
    this.accumulator = 0;
    this.framesBeforeStepping = FRAMES_BEFORE_STEPPING;
    return seed;
  }

  private setState(change: Partial<SessionState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.stateListeners) listener();
  }
}
