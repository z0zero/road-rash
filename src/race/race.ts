import { bustRidersReached } from "./busting";
import { getCoastalTrack } from "./coastal-track";
import { knockDownRidersOnFoot, runIntoCarsAndObstacles, runIntoEachOther } from "./contact";
import { alertThePlayer, decideCops, joinThePlayer, lineUpCops, moveCops } from "./cops";
import { runBack } from "./crashing";
import { DEFAULT_DIFFICULTY, DIFFICULTY_TUNING, type Difficulty } from "./difficulty";
import type { RaceEvent } from "./events";
import { lineUpRiders } from "./field";
import { advanceAttacks, recoverStamina, throwAttack } from "./fighting";
import { footprintOfCar, footprintOfObstacle } from "./footprint";
import { decideOpponents, opponentsAttack } from "./opponents";
import { clock, COUNTDOWN_STEPS, copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import { createRandom } from "./random";
import { finishCrossings, resultsOf, type RaceResults } from "./results";
import { PLAYER, whereIs, type Rider } from "./riders";
import { ride, type Controls } from "./riding";
import { snapshotOf, type RaceSnapshot } from "./snapshot";
import { STEP_SECONDS, STEPS_PER_SECOND } from "./steps";
import type { Track } from "./track";
import { CLOSED_ROAD, createTraffic, testCars, type RiderOrCopOnTheRoad, type TestCar, type Traffic } from "./traffic";

/** Once over the finish line, a rider lets go of the throttle and brakes to a stop. */
const FINISHED_CONTROLS: Controls = { throttle: 0, brake: 0.7, steer: 0 };

/**
 * Fast-forwarding races the rest of the field until the race clock reads six
 * minutes at most: a race takes about three, so everyone who can still finish
 * does, even after the player's race ended in its first seconds.
 */
const FAST_FORWARD_UNTIL_STEPS = COUNTDOWN_STEPS + 6 * 60 * STEPS_PER_SECOND;

/** At the start, cars in the race direction keep at least this many metres ahead of the riders lined up for it. */
const CLEAR_OF_THE_GRID = 60;
/** Mixed into the race's seed for the traffic's own random choices, so they never change the riders' choices. */
const TRAFFIC_SEED = 0x7ea5_1c3a;

/** The player's controls for one step. Values outside their ranges are clamped. */
export interface PlayerInput {
  /** 0 (closed) to 1 (full throttle). */
  readonly throttle: number;
  /** 0 (off) to 1 (full brake). */
  readonly brake: number;
  /** -1 (full left) to 1 (full right). */
  readonly steer: number;
  /** The punch button was pressed for this step. */
  readonly punch: boolean;
  /** The kick button was pressed for this step. */
  readonly kick: boolean;
}

export const NO_INPUT: PlayerInput = { throttle: 0, brake: 0, steer: 0, punch: false, kick: false };

/** How the game creates a race: from its seed and difficulty, with the field, the track and the rest of the tuning fixed (ADR 0004). */
export interface RaceOptions {
  /** Seeds every random choice the race makes, so the same seed, difficulty and inputs replay the same race. */
  readonly seed: number;
  /** How hard the opponents make the race: Normal unless given. */
  readonly difficulty?: Difficulty;
}

/**
 * How the Race module's own tests may set a race up besides its options, to
 * try one rule at a time. The game never does, and `@/race` doesn't export it:
 * every race in the game runs in traffic, with cops, on perfect bikes. Tests
 * reach it through `setUpRace` in their helpers.
 */
export interface TestSetup {
  /**
   * How intact the player's bike is at the start, up to 100 (perfect, the
   * default), so that a test can wreck it in a crash or two. Every
   * opponent's bike starts perfect.
   */
  readonly playerCondition?: number;
  /**
   * The cars on the road: the traffic, as in every race (the default); none,
   * on a closed road; or only the `cars` a test puts on a road closed to
   * every other car, so that it can put one in a rider's way: each stands
   * still, or drives on at a steady speed, whatever is in its way.
   */
  readonly traffic?: "flowing" | "closed" | { readonly cars: readonly TestCar[] };
  /** Whether cops wait along the track to join the race (the default). Without them, nobody is busted. */
  readonly cops?: boolean;
}

/**
 * One race, simulated deterministically in track space (ADR 0004).
 *
 * Step it by exactly `STEP_SECONDS` with the player's input for that step, read
 * snapshots of everything visible, and drain the events its steps emitted.
 */
export interface Race {
  /** The track this race is run on. It never changes. */
  readonly track: Track;
  /** Advances the race by exactly `STEP_SECONDS` with the player's input for that step. */
  step(input: PlayerInput): void;
  /** Everything visible right now, as a new object. */
  snapshot(): RaceSnapshot;
  /** Returns and clears every event emitted since the previous call, oldest first. */
  drainEvents(): RaceEvent[];
  /**
   * Once the player's race is over, races the rest of the field on towards the
   * finish, with the player's input released, by up to `steps` steps (all the
   * way, if not given), and returns the results as they stand: complete once
   * every rider has finished or is out of the race, or the race clock reads six
   * minutes. A step at a time, it can be spread over several frames. Events
   * emitted on the way are queued as usual. Throws while the player is still
   * racing.
   */
  fastForward(steps?: number): RaceResults;
}

/** Where the riders still racing are on the road, on their bikes or off them, and the cops riding in the race, whom cars make room for too. */
function onTheRoad(race: RaceState): RiderOrCopOnTheRoad[] {
  return [
    ...race.riders.filter((rider) => rider.status === "racing").map((rider) => ({ ...whereIs(rider), onTheirBike: !rider.crash })),
    ...copsInTheRace(race).map(({ motion: { distance, offset, speed } }) => ({ distance, offset, speed, onTheirBike: true })),
  ];
}

/** Advances the race by exactly `STEP_SECONDS` with the player's input for that step. */
function step(race: RaceState, input: PlayerInput) {
  const { riders, track, traffic } = race;
  // The traffic drives on whatever the riders do, even while they wait for the countdown, though none comes on behind them then.
  if (race.stepsTaken < COUNTDOWN_STEPS) traffic.step(whereIs(riders[PLAYER]), onTheRoad(race), true);
  else {
    const clockBefore = clock(race);
    // Everyone decides what to do from where things stand...
    const riding = onTheirBikes(race);
    // Everyone on a bike in the race, the cops too, whom riders and cops find their way around.
    const everyoneOnABike = [...riding.map((rider) => rider.motion), ...copsInTheRace(race).map((cop) => cop.motion)];
    const carsBefore = traffic.cars.map(footprintOfCar);
    const carsAndObstacles = [...carsBefore, ...race.obstacles];
    const opponents = decideOpponents(race, riding, everyoneOnABike, carsAndObstacles);
    const player = riders[PLAYER];
    if (player.status === "racing" && !player.crash && !player.attack && (input.punch || input.kick)) {
      throwAttack(race, player, input.punch ? "punch" : "kick");
    }
    opponentsAttack(race, riding, opponents.waiting);
    const copIntents = decideCops(race, everyoneOnABike, carsAndObstacles);
    // ...then everyone moves: riders on their bikes ride them (the player with their input, and riders over the
    // finish line braking to a stop), riders off them run back to them, and the cops and the traffic drive on...
    const distancesBefore = riders.map((rider) => whereIs(rider).distance);
    for (const rider of riders) {
      if (rider.crash) runBack(race, rider, input, carsBefore);
      else {
        const controls = rider.status !== "racing" ? FINISHED_CONTROLS : (opponents.controls.get(rider) ?? input);
        ride(rider.motion, controls, track, STEP_SECONDS);
      }
    }
    moveCops(race, copIntents);
    traffic.step(whereIs(player), onTheRoad(race));
    // ...and then what they ran into, the hits and the finish line settle what happened.
    bustRidersReached(race);
    joinThePlayer(race);
    runIntoEachOther(race, riding);
    const cars = traffic.cars.map(footprintOfCar);
    runIntoCarsAndObstacles(race, cars);
    knockDownRidersOnFoot(race, cars);
    advanceAttacks(race);
    recoverStamina(race);
    finishCrossings(race, distancesBefore, clockBefore);
    alertThePlayer(race);
  }
  race.stepsTaken++;
  if (race.stepsTaken === COUNTDOWN_STEPS) race.events.push({ type: "race-started" });
}

/** The cars on the road of a race with the seed `seed` and these `riders` lined up: its traffic, unless `setup` closes the road or puts a test's cars on it. */
function trafficFor(setup: TestSetup, track: Track, seed: number, riders: readonly Rider[]): Traffic {
  if (setup.traffic === "closed") return CLOSED_ROAD;
  if (typeof setup.traffic === "object") return testCars(setup.traffic.cars);
  const clearUntil = Math.max(...riders.map((rider) => rider.motion.distance)) + CLEAR_OF_THE_GRID;
  return createTraffic(track, createRandom(seed ^ TRAFFIC_SEED), riders[PLAYER].motion, clearUntil);
}

export function createRace(options: RaceOptions): Race {
  return setUpRace(options, {});
}

/** A race created from `options` and set up for a test as `setup` says. Only the Race module's tests call it. */
export function setUpRace({ seed, difficulty = DEFAULT_DIFFICULTY }: RaceOptions, setup: TestSetup): Race {
  const random = createRandom(seed);
  const track = getCoastalTrack();
  const difficultyTuning = DIFFICULTY_TUNING[difficulty];
  const riders = lineUpRiders(track, random, difficultyTuning, setup.playerCondition);
  const traffic = trafficFor(setup, track, seed, riders);
  const race: RaceState = {
    seed,
    difficultyTuning,
    random,
    track,
    edge: track.roadHalfWidth + track.shoulderWidth,
    riders,
    cops: setup.cops === false ? [] : lineUpCops(track),
    traffic,
    obstacles: track.obstacles.map(footprintOfObstacle),
    events: [],
    stepsTaken: 0,
    finishers: 0,
    playerBustedBy: null,
    rota: { breakSteps: 0 },
    playersFighter: null,
  };

  return {
    track,
    step: (input) => step(race, input),
    snapshot: () => snapshotOf(race),
    drainEvents: () => race.events.splice(0),
    fastForward(steps = Infinity) {
      const outcome = riders[PLAYER].status;
      if (outcome === "racing") {
        throw new Error("The player is still racing: fast-forward only once the player's race is over");
      }
      const done = () => !riders.some((rider) => rider.status === "racing") || race.stepsTaken >= FAST_FORWARD_UNTIL_STEPS;
      for (let taken = 0; taken < steps && !done(); taken++) step(race, NO_INPUT);
      return resultsOf(race, outcome, done());
    },
  };
}
