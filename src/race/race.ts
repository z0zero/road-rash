import { bustTheCaught } from "./busting";
import { getCoastalTrack } from "./coastal-track";
import { knockDownRidersOnFoot, runIntoCarsAndObstacles, runIntoEachOther } from "./contact";
import { alertThePlayer, decideCops, joinThePlayer, lineUpCops, moveCops } from "./cops";
import { runBack } from "./crashing";
import type { RaceEvent } from "./events";
import { lineUpRiders } from "./field";
import { advanceAttacks, recoverStamina, throwAttack } from "./fighting";
import { footprintOfCar, footprintOfObstacle } from "./footprint";
import { decideOpponents, opponentsAttack } from "./opponents";
import { clock, COUNTDOWN_STEPS, copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import { createRandom } from "./random";
import { finishCrossings, resultsOf, type RaceResults } from "./results";
import { PLAYER, whereIs } from "./riders";
import { ride, type Controls } from "./riding";
import { snapshotOf, type RaceSnapshot } from "./snapshot";
import { STEP_SECONDS, STEPS_PER_SECOND } from "./steps";
import type { Track } from "./track";
import { CLOSED_ROAD, createTraffic, type Traffic } from "./traffic";

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

export interface RaceOptions {
  /** Seeds every random choice the race makes, so the same seed and inputs replay the same race. */
  readonly seed: number;
  /**
   * How intact the player's bike is at the start, up to 100 (perfect, the
   * default), for a bike that comes into the race already worn. Every
   * opponent's bike starts perfect.
   */
  readonly playerCondition?: number;
  /** Whether cars drive on the road (the default). Without them, the race runs on a closed road. */
  readonly traffic?: boolean;
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

/** Where the riders still racing are on the road, on their bikes or off them. */
function ridersOnTheRoad(race: RaceState) {
  return race.riders.filter((rider) => rider.status === "racing").map((rider) => ({ ...whereIs(rider), onTheirBike: !rider.crash }));
}

/** Advances the race by exactly `STEP_SECONDS` with the player's input for that step. */
function step(race: RaceState, input: PlayerInput) {
  const { riders, track, traffic } = race;
  // The traffic drives on whatever the riders do, even while they wait for the countdown.
  if (race.stepsTaken < COUNTDOWN_STEPS) traffic.step(whereIs(riders[PLAYER]), ridersOnTheRoad(race));
  else {
    const clockBefore = clock(race);
    // Everyone decides what to do from where things stand...
    const riding = onTheirBikes(race);
    // Everyone on a bike in the race, the cops too, whom riders and cops find their way around.
    const everyoneOnABike = [...riding.map((rider) => rider.motion), ...copsInTheRace(race).map((cop) => cop.motion)];
    const carsAndObstacles = [...traffic.cars.map(footprintOfCar), ...race.obstacles];
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
      if (rider.crash) runBack(race, rider, input);
      else {
        const controls = rider.status !== "racing" ? FINISHED_CONTROLS : (opponents.controls.get(rider) ?? input);
        ride(rider.motion, controls, track, STEP_SECONDS);
      }
    }
    moveCops(race, copIntents);
    traffic.step(whereIs(player), ridersOnTheRoad(race));
    // ...and then what they ran into, the hits and the finish line settle what happened.
    bustTheCaught(race);
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

export function createRace(options: RaceOptions): Race {
  const random = createRandom(options.seed);
  const track = getCoastalTrack();
  const riders = lineUpRiders(track, random, options.playerCondition);
  const traffic: Traffic =
    options.traffic === false
      ? CLOSED_ROAD
      : createTraffic(
          track,
          createRandom(options.seed ^ TRAFFIC_SEED),
          riders[PLAYER].motion,
          Math.max(...riders.map((rider) => rider.motion.distance)) + CLEAR_OF_THE_GRID,
        );
  const race: RaceState = {
    seed: options.seed,
    random,
    track,
    edge: track.roadHalfWidth + track.shoulderWidth,
    riders,
    cops: options.cops === false ? [] : lineUpCops(track),
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
