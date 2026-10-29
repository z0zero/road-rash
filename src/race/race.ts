import { getCoastalTrack } from "./coastal-track";
import type { RaceEvent, RaceOutcome, RiderId } from "./events";
import { lineUpOpponents } from "./field";
import { opponentControls, type OpponentRiding } from "./opponent-riding";
import { OPPONENTS, PLAYER_NAME, type Temperament } from "./opponents";
import { createRandom } from "./random";
import { ride, type Controls, type Motion } from "./riding";
import type { Track } from "./track";

const STEPS_PER_SECOND = 60;

/** The race advances in fixed steps of exactly this many seconds (60 Hz). */
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

/** The player is always rider 0. */
export const PLAYER: RiderId = 0;

/** The 3-2-1 countdown lasts three seconds. */
const COUNTDOWN_STEPS = 3 * STEPS_PER_SECOND;

/** Once over the finish line, a rider lets go of the throttle and brakes to a stop. */
const FINISHED_CONTROLS: Controls = { throttle: 0, brake: 0.7, steer: 0 };

/** Fast-forwarding races the rest of the field for at most three extra simulated minutes. */
const FAST_FORWARD_STEPS = 180 * STEPS_PER_SECOND;

/** Finishing in this position or better qualifies. */
const QUALIFYING_POSITION = 3;

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

/** Whether a rider is still racing, or how their race ended. */
export type RiderStatus = "racing" | RaceOutcome;

export interface RiderSnapshot {
  readonly id: RiderId;
  /** The opponent's nickname, or "You" for the player. */
  readonly name: string;
  /** How the opponent races and fights; null for the player. */
  readonly temperament: Temperament | null;
  /** Metres along the track's centreline. */
  readonly distance: number;
  /** Metres sideways from the centreline; positive is right of the race direction. */
  readonly offset: number;
  /** Metres per second along the track. */
  readonly speed: number;
  readonly status: RiderStatus;
  /** Position in the race, 1 for the leader; null for wrecked and busted riders. */
  readonly position: number | null;
  /** Race time at which the rider crossed the finish line, in seconds; null until then. */
  readonly finishTime: number | null;
}

/** Everything visible in the race at one moment. Snapshots are plain data that later steps never change. */
export interface RaceSnapshot {
  /** Seconds left in the 3-2-1 countdown; 0 once the race has started. */
  readonly countdown: number;
  /** Race time in seconds since the start; 0 during the countdown. */
  readonly clock: number;
  /** Every rider, indexed by `RiderId`. */
  readonly riders: readonly RiderSnapshot[];
}

/** How the race went for everyone, once the player's race is over. */
export interface RaceResults {
  /** How the player's race ended. */
  readonly outcome: RaceOutcome;
  /** The player's finishing time in seconds; null unless they finished. */
  readonly time: number | null;
  /** The player's final position; null if they were wrecked or busted. */
  readonly position: number | null;
  /** Whether the player finished in third position or better. */
  readonly qualified: boolean;
  /**
   * Every rider: finishers in finishing order, then anyone still racing when
   * the fast-forward ran out of time, by distance, then wrecked and busted riders.
   */
  readonly standings: readonly Standing[];
}

export interface Standing {
  readonly rider: RiderId;
  readonly status: RiderStatus;
  readonly position: number | null;
  /** Finishing time in seconds; null unless the rider finished. */
  readonly time: number | null;
}

export interface RaceOptions {
  /** Seeds every random choice the race makes, so the same seed and inputs replay the same race. */
  readonly seed: number;
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
   * Once the player's race is over, races the rest of the field to the finish
   * (for at most three extra simulated minutes, with the player's input
   * released) and returns the final results. Events emitted on the way are
   * queued as usual. Throws while the player is still racing.
   */
  fastForward(): RaceResults;
}

interface Rider {
  readonly id: RiderId;
  readonly name: string;
  readonly temperament: Temperament | null;
  readonly motion: Motion;
  /** How an opponent rides; null for the player, whose input comes from outside. */
  readonly riding: OpponentRiding | null;
  status: RiderStatus;
  finishTime: number | null;
  /** 1 for the first rider over the finish line, 2 for the next, and so on. */
  finishOrder: number | null;
}

export function createRace(options: RaceOptions): Race {
  const random = createRandom(options.seed);
  const track = getCoastalTrack();
  let stepsTaken = 0;
  let events: RaceEvent[] = [];
  let finishers = 0;
  const riders: Rider[] = [
    {
      id: PLAYER,
      name: PLAYER_NAME,
      temperament: null,
      // On the start line, between the two lanes that run in the race direction.
      motion: { distance: track.startDistance, offset: track.laneWidth, speed: 0, steering: 0 },
      riding: null,
      status: "racing",
      finishTime: null,
      finishOrder: null,
    },
  ];
  lineUpOpponents(track, OPPONENTS.length, random).forEach(({ distance, offset }, index) => {
    riders.push({
      id: PLAYER + 1 + index,
      name: OPPONENTS[index].name,
      temperament: OPPONENTS[index].temperament,
      motion: { distance, offset, speed: 0, steering: 0 },
      riding: { pace: 0.9, lane: offset },
      status: "racing",
      finishTime: null,
      finishOrder: null,
    });
  });

  const clock = () => Math.max(0, stepsTaken - COUNTDOWN_STEPS) / STEPS_PER_SECOND;

  /** Finishes the riders who crossed the finish line during the step that began at `clockBefore`, in the order they crossed it. */
  function finishCrossings(distancesBefore: readonly number[], clockBefore: number) {
    const crossings = riders
      .filter((rider) => rider.status === "racing" && rider.motion.distance >= track.finishDistance)
      .map((rider) => {
        const before = distancesBefore[rider.id];
        const share = (track.finishDistance - before) / (rider.motion.distance - before);
        return { rider, time: clockBefore + share * STEP_SECONDS };
      })
      .sort((a, b) => a.time - b.time || a.rider.id - b.rider.id);
    for (const { rider, time } of crossings) {
      rider.finishTime = time;
      rider.status = "finished";
      rider.finishOrder = ++finishers;
      events.push({ type: "rider-finished", rider: rider.id, time, position: rider.finishOrder });
      if (rider.id === PLAYER) events.push({ type: "player-race-over", outcome: "finished" });
    }
  }

  /**
   * The riders who have a position, best first: finishers in finishing order,
   * then riders still racing by distance travelled. Wrecked and busted riders
   * have no position.
   */
  function ranking() {
    const finished = riders
      .filter((rider) => rider.status === "finished")
      .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0));
    const racing = riders
      .filter((rider) => rider.status === "racing")
      .sort((a, b) => b.motion.distance - a.motion.distance);
    return [...finished, ...racing];
  }

  function positions() {
    return new Map(ranking().map((rider, index) => [rider.id, index + 1]));
  }

  function results(outcome: RaceOutcome): RaceResults {
    const standing = (rider: Rider, position: number | null): Standing => ({
      rider: rider.id,
      status: rider.status,
      position,
      time: rider.finishTime,
    });
    const unplaced = riders.filter((rider) => rider.status === "wrecked" || rider.status === "busted");
    const standings = [
      ...ranking().map((rider, index) => standing(rider, index + 1)),
      ...unplaced.map((rider) => standing(rider, null)),
    ];
    const position = standings.find((entry) => entry.rider === PLAYER)?.position ?? null;
    return {
      outcome,
      time: riders[PLAYER].finishTime,
      position,
      qualified: outcome === "finished" && position !== null && position <= QUALIFYING_POSITION,
      standings,
    };
  }

  const race: Race = {
    track,
    step(input) {
      if (stepsTaken >= COUNTDOWN_STEPS) {
        const clockBefore = clock();
        // Everyone decides what to do from where things stand, then everyone moves.
        const controls = riders.map((rider) => {
          if (rider.status !== "racing") return FINISHED_CONTROLS;
          return rider.riding ? opponentControls(rider.motion, rider.riding, track) : input;
        });
        const distancesBefore = riders.map((rider) => rider.motion.distance);
        riders.forEach((rider, index) => ride(rider.motion, controls[index], track, STEP_SECONDS));
        finishCrossings(distancesBefore, clockBefore);
      }
      stepsTaken++;
      if (stepsTaken === COUNTDOWN_STEPS) events.push({ type: "race-started" });
    },
    snapshot() {
      const ranks = positions();
      return {
        countdown: Math.max(0, COUNTDOWN_STEPS - stepsTaken) / STEPS_PER_SECOND,
        clock: clock(),
        riders: riders.map((rider) => ({
          id: rider.id,
          name: rider.name,
          temperament: rider.temperament,
          distance: rider.motion.distance,
          offset: rider.motion.offset,
          speed: rider.motion.speed,
          status: rider.status,
          position: ranks.get(rider.id) ?? null,
          finishTime: rider.finishTime,
        })),
      };
    },
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
    fastForward() {
      const outcome = riders[PLAYER].status;
      if (outcome === "racing") {
        throw new Error("The player is still racing: fast-forward only once the player's race is over");
      }
      const limit = stepsTaken + FAST_FORWARD_STEPS;
      while (riders.some((rider) => rider.status === "racing") && stepsTaken < limit) race.step(NO_INPUT);
      return results(outcome);
    },
  };
  return race;
}
