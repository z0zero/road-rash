import { describe, expect, it } from "vitest";
import { createRace, PLAYER, type RaceEvent, type RaceResults } from ".";
import {
  alongsideTheFirstCop,
  autopilot,
  chase,
  CLOSED_ROAD,
  eventsUntil,
  nearestOpponent,
  player,
  secondsUntil,
  startedRace,
  stepFor,
} from "./test-helpers";

/** The results of a race (on a closed road) that the player rode to the finish at up to `targetSpeed`. */
function rideToTheFinish(seed: number, targetSpeed: number): RaceResults {
  const race = startedRace(seed, CLOSED_ROAD);
  secondsUntil(race, autopilot(race, { targetSpeed }), () => player(race).status !== "racing");
  return race.fastForward();
}

/**
 * The results of a race in which the player, on a bike with next to no
 * condition left, rode into the opponent who lined up nearest them, which
 * wrecked it.
 */
function rideToAWreck(seed: number): RaceResults {
  const race = createRace({ seed, playerCondition: 1 });
  stepFor(race, 3);
  const target = nearestOpponent(race);
  secondsUntil(race, chase(race, target, 12), () => player(race).status !== "racing", 120);
  return race.fastForward();
}

/**
 * A race in which a cop busted the player, who punched the first cop and rode
 * on beside it as it fought back, until a hit knocked them off there: its
 * results, the cops as it ended, and which cop busted the player.
 */
function rideToABust(seed: number) {
  const { race, input } = alongsideTheFirstCop(seed);
  const punchingTheCopOnce = () => ({ ...input(), punch: race.snapshot().cops[0].stamina === 150 });
  const events = eventsUntil(race, punchingTheCopOnce, (event) => event.type === "player-race-over", 30);
  const bust = events.find((event): event is Extract<RaceEvent, { type: "busted" }> => event.type === "busted" && event.rider === PLAYER);
  return { results: race.fastForward(), cops: race.snapshot().cops, bustedBy: bust?.cop };
}

/** `make`, remembering what it made for each key: a race replays identically, so its results can be shared. */
function remembered<T>(make: (seed: number) => T): (seed: number) => T {
  const made = new Map<number, T>();
  return (seed) => {
    const known = made.get(seed);
    if (known !== undefined) return known;
    const fresh = make(seed);
    made.set(seed, fresh);
    return fresh;
  };
}

/** A race ridden flat out to the finish, which qualifies. */
const winningRace = remembered((seed) => rideToTheFinish(seed, Infinity));
/** A race ridden to the finish at up to 45 m/s, too slowly to qualify. */
const slowRace = remembered((seed) => rideToTheFinish(seed, 45));
/** Seeds in which nobody knocks the player off near a cop on the slow ride, which would get them busted. */
const SLOW_SEEDS = [2, 4, 5];
const wreckedRace = remembered(rideToAWreck);

/** Who a remark comes from, as the standings name them. */
function speakerOf(results: RaceResults) {
  const { by, name } = results.remark;
  return { by, name, standing: results.standings.find((standing) => standing.rider === by.id) };
}

describe("the remark on the results", () => {
  it("comes from an opponent when the player finished", () => {
    const results = winningRace(1);

    expect(results.outcome).toBe("finished");
    const { by, name, standing } = speakerOf(results);
    expect(by.kind).toBe("rider");
    expect(by.id).not.toBe(PLAYER);
    expect(name).toBe(standing?.name);
    expect(results.remark.line).toMatch(/\w/);
  });

  it("comes from an opponent the player beat, when the player qualified", () => {
    const results = winningRace(1);

    expect(results.qualified).toBe(true);
    expect(speakerOf(results).standing?.position).toBeGreaterThan(results.position ?? Infinity);
  });

  it("comes from an opponent who beat the player, when the player finished without qualifying", () => {
    for (const seed of SLOW_SEEDS) {
      const results = slowRace(seed);

      expect(results).toMatchObject({ outcome: "finished", qualified: false });
      expect(speakerOf(results).standing?.position).toBeLessThan(results.position ?? -Infinity);
    }
  });

  it("comes from an opponent still in the race when the player's bike was wrecked", () => {
    for (const seed of [1, 2, 3]) {
      const results = wreckedRace(seed);

      expect(results.outcome).toBe("wrecked");
      const { by, name, standing } = speakerOf(results);
      expect(by).toMatchObject({ kind: "rider" });
      expect(by.id).not.toBe(PLAYER);
      expect(name).toBe(standing?.name);
      expect(standing?.position).not.toBeNull();
    }
  });

  it("comes from the cop who busted the player", () => {
    const { results, cops, bustedBy } = rideToABust(1);

    expect(results.outcome).toBe("busted");
    expect(bustedBy).toBeDefined();
    expect(results.remark).toMatchObject({ by: { kind: "cop", id: bustedBy }, name: cops.find((cop) => cop.id === bustedBy)?.name });
    expect(results.remark.line).toMatch(/\w/);
  });

  it("is chosen with the race's seed: the same race gives the same remark, other races others", () => {
    expect(rideToAWreck(1).remark).toEqual(wreckedRace(1).remark);

    const remarks = [1, 2, 3].flatMap((seed, index) => [wreckedRace(seed).remark, slowRace(SLOW_SEEDS[index]).remark]);
    expect(new Set(remarks.map(({ name, line }) => `${name}: ${line}`)).size).toBeGreaterThan(3);
  });
});
