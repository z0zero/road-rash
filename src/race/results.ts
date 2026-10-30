import type { RaceOutcome, RiderId } from "./events";
import { QUALIFYING_POSITION } from "./limits";
import type { RaceState } from "./race-state";
import { createRandom } from "./random";
import { remarkOn, type Ending, type Remark } from "./remarks";
import { isPlayer, PLAYER, whereIs, type Rider, type RiderStatus } from "./riders";
import { STEP_SECONDS } from "./steps";

/** Mixed into the race's seed for choosing the remark on the results, so the choice never changes the race. */
const REMARK_SEED = 0x2e3a_4b51;

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
   * Whether the standings are final: false while the rest of the field is
   * still being raced to the finish. The player's own result above is final
   * either way.
   */
  readonly complete: boolean;
  /**
   * Every rider: finishers in finishing order, then anyone still racing (on
   * their way to the finish, or, once the standings are complete, still on the
   * road when the fast-forward ran out of time), by distance, then wrecked and
   * busted riders.
   */
  readonly standings: readonly Standing[];
  /** A one-line remark on how the player's race went, chosen with the race's seed; null until the standings are complete. */
  readonly remark: Remark | null;
}

export interface Standing {
  readonly rider: RiderId;
  /** The opponent's nickname, or "You" for the player. */
  readonly name: string;
  readonly status: RiderStatus;
  readonly position: number | null;
  /** Finishing time in seconds; null unless the rider finished. */
  readonly time: number | null;
}

/** Finishes the riders who crossed the finish line during the step that began at `clockBefore`, in the order they crossed it. */
export function finishCrossings(race: RaceState, distancesBefore: readonly number[], clockBefore: number) {
  const { track } = race;
  const crossings = race.riders
    .filter((rider) => rider.status === "racing" && whereIs(rider).distance >= track.finishDistance)
    .map((rider) => {
      const before = distancesBefore[rider.id];
      const share = (track.finishDistance - before) / (whereIs(rider).distance - before);
      return { rider, time: clockBefore + share * STEP_SECONDS };
    })
    .sort((a, b) => a.time - b.time || a.rider.id - b.rider.id);
  for (const { rider, time } of crossings) {
    rider.finishTime = time;
    rider.status = "finished";
    rider.finishOrder = ++race.finishers;
    race.events.push({ type: "rider-finished", rider: rider.id, time, position: rider.finishOrder });
    if (isPlayer(rider)) race.events.push({ type: "player-race-over", outcome: "finished" });
  }
}

/**
 * The riders who have a position, best first: finishers in finishing order,
 * then riders still racing by distance travelled. Wrecked and busted riders
 * have no position.
 */
function inPositionOrder(race: RaceState) {
  const finished = race.riders
    .filter((rider) => rider.status === "finished")
    .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0));
  const racing = race.riders
    .filter((rider) => rider.status === "racing")
    .sort((a, b) => whereIs(b).distance - whereIs(a).distance);
  return [...finished, ...racing];
}

/** Every rider's position, by their id; wrecked and busted riders have none. */
export function positions(race: RaceState): Map<RiderId, number> {
  return new Map(inPositionOrder(race).map((rider, index) => [rider.id, index + 1]));
}

/**
 * The results as they stand, for a player whose race ended with `outcome`:
 * `complete` once the rest of the field has been raced to the finish.
 */
export function resultsOf(race: RaceState, outcome: RaceOutcome, complete: boolean): RaceResults {
  const { riders } = race;
  const standing = (rider: Rider, position: number | null): Standing => ({
    rider: rider.id,
    name: rider.name,
    status: rider.status,
    position,
    time: rider.finishTime,
  });
  const unplaced = riders.filter((rider) => rider.status === "wrecked" || rider.status === "busted");
  const standings = [
    ...inPositionOrder(race).map((rider, index) => standing(rider, index + 1)),
    ...unplaced.map((rider) => standing(rider, null)),
  ];
  const position = standings.find((entry) => entry.rider === PLAYER)?.position ?? null;
  const qualified = outcome === "finished" && position !== null && position <= QUALIFYING_POSITION;
  const opponents = standings.flatMap(({ rider, name, position }) => {
    const them = riders[rider];
    return isPlayer(them) ? [] : [{ id: rider, name, temperament: them.temperament, position }];
  });
  const remark = complete
    ? remarkOn(endingFor(race, outcome, position, qualified), opponents, createRandom(race.seed ^ REMARK_SEED))
    : null;
  return { outcome, time: riders[PLAYER].finishTime, position, qualified, complete, standings, remark };
}

/** How the player's race ended, for the remark on it: a race that neither finished nor got them busted wrecked their bike. */
function endingFor(race: RaceState, outcome: RaceOutcome, position: number | null, qualified: boolean): Ending {
  const { playerBustedBy } = race;
  if (outcome === "busted" && playerBustedBy) return { outcome, cop: { id: playerBustedBy.id, name: playerBustedBy.name } };
  if (outcome === "finished" && position !== null) return { outcome, position, qualified };
  return { outcome: "wrecked" };
}
