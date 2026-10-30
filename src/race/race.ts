import { bustTheCaught, letGo } from "./busting";
import { getCoastalTrack } from "./coastal-track";
import { knockDownRidersOnFoot, runIntoCarsAndObstacles, runIntoEachOther } from "./contact";
import {
  bustingIntent,
  COP_ATTACK_EVERY_SECONDS,
  fightingBackIntent,
  lineUpCops,
  moveCop,
  takeTurns,
  patrolIntent,
  pullingOverIntent,
  type CopIntent,
} from "./cops";
import { carryOn, runBack, slide, STAND_STILL } from "./crashing";
import type { RaceEvent } from "./events";
import { lineUpOpponents } from "./field";
import {
  advanceAttacks,
  isMidSwing,
  nearestWithinReach,
  punchOf,
  recoverStamina,
  targetsFor,
  throwAttack,
  withinReach,
} from "./fighting";
import { footprintOfACopsBike, footprintOfCar, footprintOfObstacle, type Footprint } from "./footprint";
import {
  isDroppingBack,
  isFightingBack,
  opponentAttack,
  opponentIntent,
  waitingIntent,
  wearPatience,
  whoseTurn,
  wholePatience,
} from "./opponent-fighting";
import { catchUpFor, opponentControls, paceAt, paceFor, type Intent } from "./opponent-riding";
import { OPPONENTS, PLAYER_NAME } from "./opponents";
import { clock, COUNTDOWN_STEPS, copsInTheRace, onTheirBikes, type RaceState } from "./race-state";
import { createRandom } from "./random";
import { finishCrossings, resultsOf, type RaceResults } from "./results";
import { PLAYER, whereIs, type Rider } from "./riders";
import { ride, type Controls, type Motion } from "./riding";
import { snapshotOf, type RaceSnapshot } from "./snapshot";
import { STEP_SECONDS, STEPS_PER_SECOND, stepsIn } from "./steps";
import { apart, type Track } from "./track";
import { CLOSED_ROAD, createTraffic, type Traffic } from "./traffic";
import { TUNING } from "./tuning";

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

/**
 * A rider on the grid: fresh, on a bike in perfect condition, standing at
 * `distance` and `offset`. Bullies start the race with a club.
 */
function lineUp(rider: Pick<Rider, "id" | "name" | "temperament" | "riding">, distance: number, offset: number): Rider {
  return {
    ...rider,
    kind: "rider",
    motion: { distance, offset, speed: 0, steering: 0, shove: 0, kickShove: 0 },
    status: "racing",
    finishTime: null,
    finishOrder: null,
    stamina: TUNING.fullStamina,
    condition: TUNING.fullCondition,
    stepsSinceHit: Infinity,
    attack: null,
    weapon: rider.temperament === "bully" ? "club" : null,
    crash: null,
    droppingBack: false,
    patience: wholePatience(),
    stepsSinceThePlayerHitIt: Infinity,
    breatherSteps: 0,
  };
}

/** Where the riders still racing are on the road, on their bikes or off them. */
function ridersOnTheRoad(race: RaceState) {
  return race.riders.filter((rider) => rider.status === "racing").map((rider) => ({ ...whereIs(rider), onTheirBike: !rider.crash }));
}

/**
 * What every cop does this step, from where things stand: rides to bust a
 * crashed rider who hasn't got away yet; or fights back against the rider
 * who hit it, riding alongside them and swinging at them when they are
 * within reach; or stands by a rider it has just busted, on the shoulder;
 * or else patrols near the player, pulling over onto the shoulder while the
 * player is down after a crash it isn't riding to. Cops find their way around everyone on a bike, the
 * riders and each other (`everyoneOnABike`), and the cars and obstacles on
 * the road. Returns each cop's intent, or null for a cop not riding in the
 * race.
 */
function decideCops(
  race: RaceState,
  everyoneOnABike: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): (CopIntent | null)[] {
  const { riders, cops, track, edge } = race;
  letGo(race);
  for (const cop of copsInTheRace(race)) {
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    cop.fightingBackSteps = Math.max(0, cop.fightingBackSteps - 1);
    if (fighting && (cop.fightingBackSteps === 0 || fighting.status !== "racing")) cop.fightingBack = null;
    cop.attackCooldownSteps = Math.max(0, cop.attackCooldownSteps - 1);
    cop.standingBySteps = Math.max(0, cop.standingBySteps - 1);
  }
  for (const cop of copsInTheRace(race)) {
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    if (!fighting || fighting.crash || cop.busting !== null || cop.attack || cop.attackCooldownSteps > 0) continue;
    if (!withinReach(cop.motion, fighting.motion, punchOf(cop))) continue;
    throwAttack(race, cop, "punch");
    cop.attackCooldownSteps = stepsIn(COP_ATTACK_EVERY_SECONDS);
  }
  const player = whereIs(riders[PLAYER]);
  takeTurns(cops, race.rota, player, (cop) => cop.busting !== null || cop.fightingBack !== null || cop.standingBySteps > 0);
  return cops.map((cop) => {
    if (cop.status !== "riding") return null;
    if (cop.busting !== null) {
      return bustingIntent(cop.motion, whereIs(riders[cop.busting]), everyoneOnABike, carsAndObstacles, edge);
    }
    const fighting = cop.fightingBack === null ? null : riders[cop.fightingBack];
    if (fighting && !fighting.crash) {
      return fightingBackIntent(cop.motion, fighting.motion, track, everyoneOnABike, carsAndObstacles);
    }
    // Standing by a rider it has busted, or on patrol while the player is down, a cop pulls over onto the shoulder.
    if (cop.standingBySteps > 0 || riders[PLAYER].crash) return pullingOverIntent(cop.motion, track);
    return patrolIntent(cop.motion, player, cop.following, track, everyoneOnABike, carsAndObstacles);
  });
}

/** Cops waiting on the shoulder join the race once the player, still racing, has passed them. */
function joinThePlayer(race: RaceState) {
  const player = race.riders[PLAYER];
  if (player.status !== "racing") return;
  for (const cop of race.cops) {
    if (cop.status === "waiting" && whereIs(player).distance >= cop.motion.distance) cop.status = "riding";
  }
}

/** Says which cops have come near the player, and which have gone: cops in the race within their alert range of the player. */
function alertThePlayer(race: RaceState) {
  for (const cop of race.cops) {
    const near = cop.status === "riding" && apart(cop.motion, whereIs(race.riders[PLAYER])) <= TUNING.cops.alertRange;
    if (near === cop.near) continue;
    cop.near = near;
    race.events.push({ type: near ? "cop-near" : "cop-gone", cop: cop.id });
  }
}

/** Advances the race by exactly `STEP_SECONDS` with the player's input for that step. */
function step(race: RaceState, input: PlayerInput) {
  const { riders, cops, track, traffic, edge, random } = race;
  // The traffic drives on whatever the riders do, even while they wait for the countdown.
  if (race.stepsTaken < COUNTDOWN_STEPS) traffic.step(whereIs(riders[PLAYER]), ridersOnTheRoad(race));
  else {
    const clockBefore = clock(race);
    // Everyone decides what to do from where things stand, then everyone moves.
    const riding = onTheirBikes(race);
    const field = riding.map((rider) => rider.motion);
    // Everyone on a bike in the race, the cops too, whom riders and cops find their way around.
    const everyoneOnABike = [...field, ...copsInTheRace(race).map((cop) => cop.motion)];
    const player = riders[PLAYER];
    // Catch-up keeps the field near the player, so it stops once the player's race is over.
    const catchUp = (rider: Rider) =>
      player.status === "racing" ? catchUpFor(rider.motion.distance - whereIs(player).distance) : 1;
    const playerToFight = player.status === "racing" && !player.crash ? player.motion : null;
    for (const rider of riders) {
      rider.stepsSinceThePlayerHitIt++;
      rider.breatherSteps = Math.max(0, rider.breatherSteps - 1);
    }
    // What each opponent is up to: brawlers and bullies lose patience with a player who rides slowly beside them.
    const intents = new Map<Rider, Intent>();
    for (const rider of riding) {
      if (!rider.riding || !rider.temperament) continue;
      rider.droppingBack = isDroppingBack(rider.droppingBack, rider.stamina);
      const intent = opponentIntent(rider.temperament, rider.motion, playerToFight, rider.droppingBack, rider.patience.gaveUp);
      wearPatience(rider.patience, intent.alongside !== null, playerToFight?.speed ?? null, paceAt(rider.motion, rider.riding, track));
      intents.set(rider, intent);
    }
    // Brawlers and bullies take turns at the player: any that want to fight them while another has its turn wait theirs.
    const wanting = playerToFight ? riding.filter((rider) => intents.get(rider)?.alongside === playerToFight) : [];
    race.playersFighter = playerToFight ? whoseTurn(race.playersFighter, wanting, playerToFight) : null;
    const waiting = new Set(wanting.filter((rider) => rider !== race.playersFighter));
    for (const rider of waiting) if (playerToFight) intents.set(rider, waitingIntent(rider.motion, playerToFight));
    const carsAndObstacles = [...traffic.cars.map(footprintOfCar), ...race.obstacles];
    // Opponents see the cops' bikes, riding or waiting on the shoulder, as they see a car: they slow down in time for
    // a slower one in their path, pulling out to join the race or riding to a crash, and ride round it.
    const forTheOpponents = [
      ...carsAndObstacles,
      ...cops.filter((cop) => cop.status !== "knocked-off").map((cop) => footprintOfACopsBike(cop.motion)),
    ];
    // Riders off their bikes need no controls: their bikes slide on by themselves.
    const controls = riders.map((rider) => {
      if (rider.status !== "racing" || rider.crash) return FINISHED_CONTROLS;
      const intent = intents.get(rider);
      if (!rider.riding || !intent) return input;
      return opponentControls(rider.motion, rider.riding, track, everyoneOnABike, catchUp(rider), intent, forTheOpponents);
    });
    if (player.status === "racing" && !player.crash && !player.attack && (input.punch || input.kick)) {
      throwAttack(race, player, input.punch ? "punch" : "kick");
    }
    for (const opponent of riding) {
      if (!opponent.temperament || opponent.attack || opponent.droppingBack) continue;
      const nearest = nearestWithinReach(opponent.motion, targetsFor(race, opponent), punchOf(opponent));
      // Opponents leave the cops alone.
      if (nearest?.kind !== "rider") continue;
      // A player who doesn't fight an opponent back gets a breather after each of its hits, and is spared by those
      // waiting their turn.
      const spared = opponent.breatherSteps > 0 || waiting.has(opponent);
      if (nearest.id === PLAYER && spared && !isFightingBack(opponent.stepsSinceThePlayerHitIt)) continue;
      const kind = opponentAttack(opponent.temperament, nearest.id === PLAYER, isMidSwing(nearest.attack), random);
      // A club reaches further than a kick: a club holder swings at a rider its kick can't reach.
      if (kind) throwAttack(race, opponent, kind === "kick" && !withinReach(opponent.motion, nearest.motion, kind) ? "punch" : kind);
    }
    const copIntents = decideCops(race, everyoneOnABike, carsAndObstacles);
    const distancesBefore = riders.map((rider) => whereIs(rider).distance);
    riders.forEach((rider, index) => {
      if (!rider.crash) {
        ride(rider.motion, controls[index], track, STEP_SECONDS);
      } else {
        runBack(race, rider, input);
      }
    });
    cops.forEach((cop, index) => {
      const intent = copIntents[index];
      if (intent) moveCop(cop.motion, intent, edge);
      // A cop's bike parked on the shoulder, bumped, slides to a stop.
      if (cop.status === "waiting") slide(cop.motion, edge);
      // A knocked-off cop's bike slides to a stop while they tumble, and then they stay where they are.
      if (cop.crash) {
        slide(cop.motion, edge);
        carryOn(cop.crash, cop.motion, STAND_STILL, edge);
      }
    });
    traffic.step(whereIs(player), ridersOnTheRoad(race));
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
  // The player starts on the start line, between the two lanes that run in the race direction.
  const riders: Rider[] = [
    {
      ...lineUp({ id: PLAYER, name: PLAYER_NAME, temperament: null, riding: null }, track.startDistance, track.laneWidth),
      condition: Math.min(TUNING.fullCondition, options.playerCondition ?? TUNING.fullCondition),
    },
  ];
  lineUpOpponents(track, OPPONENTS.length, random).forEach(({ distance, offset }, index) => {
    const { name, temperament, skill } = OPPONENTS[index];
    const riding = { pace: paceFor(skill), lane: offset };
    riders.push(lineUp({ id: PLAYER + 1 + index, name, temperament, riding }, distance, offset));
  });
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
