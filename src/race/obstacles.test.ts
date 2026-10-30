import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, type ObstaclePlacement, type Race } from ".";
import {
  autopilot,
  eventsDuring,
  eventsUntil,
  leftOnTheirOwn,
  NO_COPS,
  player,
  playerCrashed,
  rideInto,
  secondsUntil,
  stepFor,
  WHOLE_RACES,
} from "./test-helpers";


/**
 * A started race in which the field has ridden off, leaving the player on
 * their own on the start line, and the first obstacle of a kind ahead of
 * them. There are no cops, who would bust the player for crashing into it.
 */
function onTheirOwn(isKind: (obstacle: ObstaclePlacement) => boolean) {
  const race = leftOnTheirOwn(1, NO_COPS);
  const obstacle = race.track.obstacles.find((other) => isKind(other) && other.distance > player(race).distance + 100);
  if (!obstacle) throw new Error("no such obstacle");
  return { race, obstacle };
}

/** Rides into `obstacle` at about `speed` and returns the player's crash, and their speed on the step before it. */
function crashInto(race: Race, obstacle: ObstaclePlacement, speed: number) {
  race.drainEvents();
  const input = rideInto(race, obstacle, speed);
  let before = 0;
  const riding = () => ((before = player(race).speed), input());
  const crashes = eventsUntil(race, riding, playerCrashed, 120).filter(playerCrashed);
  return { crashes, before };
}

describe("an obstacle", () => {
  it("crashes a rider who rides into one on the shoulder: a rock, a sign or a post", () => {
    const { race, obstacle } = onTheirOwn((other) => other.kind !== "fallen-rock");

    const { crashes, before } = crashInto(race, obstacle, 15);

    expect(crashes).toEqual([{ type: "crash", rider: PLAYER, cause: "obstacle", impactSpeed: expect.closeTo(before, 0) }]);
    expect(Math.abs(obstacle.offset)).toBeGreaterThan(race.track.roadHalfWidth);
    // The bike stops against it, and the rider is thrown on past it.
    const { bike, distance } = player(race);
    expect(bike.distance).toBeLessThan(obstacle.distance);
    expect(bike.distance).toBeGreaterThan(obstacle.distance - obstacle.radius - 2);
    stepFor(race, 0.5, { ...NO_INPUT, brake: 1 });
    expect(player(race).distance).toBeGreaterThan(distance);
  });

  it("crashes a rider who rides into a fallen rock on the road", WHOLE_RACES, () => {
    const { race, obstacle } = onTheirOwn((other) => other.kind === "fallen-rock");
    // Up to it like a careful rider, round the traffic, then straight at it for the last few metres.
    secondsUntil(race, autopilot(race), () => player(race).distance > obstacle.distance - 40, 300);

    const { crashes, before } = crashInto(race, obstacle, 15);

    expect(crashes).toEqual([{ type: "crash", rider: PLAYER, cause: "obstacle", impactSpeed: expect.closeTo(before, 0) }]);
    expect(Math.abs(obstacle.offset)).toBeLessThanOrEqual(race.track.roadHalfWidth);
  });

  it("only bumps a rider who rides into one at walking pace: they don't crash, and can't ride through it", () => {
    const { race, obstacle } = onTheirOwn((other) => other.kind !== "fallen-rock");
    secondsUntil(race, rideInto(race, obstacle, 15), () => player(race).distance > obstacle.distance - 40, 60);
    const input = rideInto(race, obstacle, 4);
    /** How far into the obstacle the bike gets, along the track and across it: negative while they are clear of each other. */
    const into = { along: -Infinity, across: -Infinity, both: -Infinity };

    const events = eventsDuring(race, 20, () => {
      const me = player(race);
      // A bike is about 2 m long and 0.8 m wide.
      const along = obstacle.radius + 1 - Math.abs(obstacle.distance - me.distance);
      const across = obstacle.radius + 0.4 - Math.abs(obstacle.offset - me.offset);
      [into.along, into.across, into.both] = [Math.max(into.along, along), Math.max(into.across, across), Math.max(into.both, Math.min(along, across))];
      return input();
    });

    expect(events.filter(playerCrashed)).toEqual([]);
    expect(player(race).crash).toBeNull();
    // It came right up against the obstacle, but never into it.
    expect(into.both).toBeGreaterThan(-0.2);
    expect(into.both).toBeLessThan(0.1);
    expect(player(race).distance).toBeGreaterThan(obstacle.distance);
  });
});
