import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, type PlayerInput, type Race } from ".";
import {
  alongsideTheFirstCop,
  apart,
  autopilot,
  CLOSED_ROAD,
  eventsUntil,
  nearestOpponent,
  nearestWithinReach,
  nearingTheWaitingCop,
  NO_COPS,
  player,
  rideAlongside,
  secondsUntil,
  startedRace,
  stepFor,
  STEPS_PER_SECOND,
} from "./test-helpers";

const FIRST_COP = { kind: "cop", id: 0 } as const;

/**
 * A started race on a closed road with no cops, in which the player has
 * ridden up alongside the racer who lined up nearest them, 1.4 m to its side
 * towards the middle of the road (`side` 1), or 1.4 m to its other side
 * (`side` -1), until it is the nearest rider within their reach.
 */
function alongsideTheNearestRacer(side: 1 | -1, seed: number) {
  const race = startedRace(seed, { ...CLOSED_ROAD, ...NO_COPS });
  const target = nearestOpponent(race, "racer");
  const input = rideAlongside(race, target, { across: side * 1.4 });
  secondsUntil(race, input, () => nearestWithinReach(race.snapshot().riders, player(race)) === target, 60);
  return { race, target };
}

/** Steps `race` with `input` for `seconds`, handing every snapshot to `watch`. */
function watchFor(race: Race, seconds: number, input: () => PlayerInput, watch: () => void) {
  for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
    race.step(input());
    watch();
  }
}

describe("the opponent or cop the HUD names", () => {
  it("is the opponent riding alongside the player", () => {
    const { race, target } = alongsideTheNearestRacer(1, 1);

    expect(race.snapshot().nearestOpponentOrCop).toEqual({ kind: "rider", id: target });
  });

  it("is nobody while every opponent is far away: up the road, with the player still on the start line", () => {
    const race = startedRace(1, { ...CLOSED_ROAD, ...NO_COPS });
    stepFor(race, 30);
    const { riders, nearestOpponentOrCop } = race.snapshot();

    for (const rider of riders.filter(({ id }) => id !== PLAYER)) expect(rider.distance - riders[PLAYER].distance).toBeGreaterThan(100);
    expect(nearestOpponentOrCop).toBeNull();
  });

  it("is the cop in the race riding alongside the player, with no opponent as near", () => {
    const { race } = alongsideTheFirstCop();

    expect(race.snapshot().nearestOpponentOrCop).toEqual(FIRST_COP);
  });

  it("is never a cop still waiting on the shoulder, however near the player", () => {
    // The player slows down 400 m short of the first cop, rolls up to within 15 m of it and stops there.
    const { race, cop } = nearingTheWaitingCop(400);
    let near = 0;
    const watch = () => {
      if (cop().status !== "waiting" || apart(cop(), player(race)) > 30) return;
      near++;
      expect(race.snapshot().nearestOpponentOrCop).not.toEqual(FIRST_COP);
    };
    const rolling = autopilot(race, { targetSpeed: 8 });
    secondsUntil(race, () => (watch(), rolling()), () => cop().distance - player(race).distance < 15, 120);
    watchFor(race, 3, () => ({ ...NO_INPUT, brake: 1 }), watch);

    expect(cop().status).toBe("waiting");
    expect(near).toBeGreaterThan(3 * STEPS_PER_SECOND);
  });

  it("is never a cop knocked out of the race, however near the player", () => {
    // The player punches the first cop off its bike and stops by it.
    const { race, input } = alongsideTheFirstCop(3);
    const cop = () => race.snapshot().cops[0];
    eventsUntil(race, () => ({ ...input(), punch: true }), (event) => event.type === "cop-knocked-off", 30);
    let near = 0;
    watchFor(race, 3, () => ({ ...NO_INPUT, brake: 1 }), () => {
      if (apart(cop(), player(race)) > 30) return;
      near++;
      expect(race.snapshot().nearestOpponentOrCop).not.toEqual(FIRST_COP);
    });

    expect(cop().status).toBe("knocked-off");
    expect(near).toBeGreaterThan(STEPS_PER_SECOND);
  });
});

describe("the warnings", () => {
  it("are on the right of a player with an opponent alongside them on their right", () => {
    const { race, target } = alongsideTheNearestRacer(1, 1);
    const { riders, warnings } = race.snapshot();

    expect(riders[target].offset).toBeGreaterThan(riders[PLAYER].offset);
    expect(warnings.right).toBe(true);
  });

  it("are on the left of a player with an opponent alongside them on their left", () => {
    const { race, target } = alongsideTheNearestRacer(-1, 2);
    const { riders, warnings } = race.snapshot();

    expect(riders[target].offset).toBeLessThan(riders[PLAYER].offset);
    expect(warnings.left).toBe(true);
  });

  it("are on the side of a cop coming up from behind the player, 5 to 20 m back and faster", () => {
    // The player passes the first cop in the outer lane and stops: the cop joins the race and follows them, riding up
    // from behind in its own lane.
    const race = startedRace(1, CLOSED_ROAD);
    const cop = () => race.snapshot().cops[0];
    secondsUntil(race, autopilot(race, { lane: 4.5 }), () => player(race).distance >= cop().distance + 30, 120);
    const sides = new Set<string>();
    watchFor(race, 15, () => ({ ...NO_INPUT, brake: 1 }), () => {
      const { riders, cops, warnings } = race.snapshot();
      const [me, them] = [riders[PLAYER], cops[0]];
      const behind = me.distance - them.distance;
      if (behind < 5 || behind > 20 || them.speed < me.speed + 2) return;
      const side = them.offset < me.offset ? "left" : "right";
      sides.add(side);
      expect(warnings[side]).toBe(true);
    });

    expect(sides.size).toBeGreaterThan(0);
  });

  it("are quiet while nobody is near, as on the start line", () => {
    const race = startedRace();
    race.step(NO_INPUT);

    expect(race.snapshot().warnings).toEqual({ left: false, right: false });
  });
});
