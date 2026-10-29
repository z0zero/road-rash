import { describe, expect, it } from "vitest";
import { createRace, PLAYER, type AttackKind, type RaceEvent, type RiderId } from ".";
import { alongsideAn, eventsUntil, player } from "./test-helpers";

/** The kind of every attack `attacker` threw among `events`. */
const thrownBy = (attacker: RiderId, events: readonly RaceEvent[]): AttackKind[] =>
  events.flatMap((event) => (event.type === "attack-thrown" && event.attacker.id === attacker ? [event.kind] : []));

const isSwingLandingOn = (target: RiderId) => (event: RaceEvent) =>
  event.type === "attack-landed" && event.kind === "club-swing" && event.target.id === target;

describe("clubs", () => {
  it("are held at the start by the three bullies, and by nobody else", () => {
    const { riders } = createRace({ seed: 1 }).snapshot();

    const holders = riders.filter((rider) => rider.weapon === "club");
    expect(holders.map((rider) => rider.temperament)).toEqual(["bully", "bully", "bully"]);
    expect(riders.filter((rider) => rider.weapon !== "club").every((rider) => rider.weapon === null)).toBe(true);
  });

  it("are swung instead of punching: a bully holding one swings it or kicks, and never punches", () => {
    const { race, target, input } = alongsideAn("bully");

    const events = eventsUntil(race, input, isSwingLandingOn(PLAYER), 30);

    expect(race.snapshot().riders[target].weapon).toBe("club");
    expect(thrownBy(target, events)).toContain("club-swing");
    expect(thrownBy(target, events)).not.toContain("punch");
  });

  it("lower the stamina of the rider a swing lands on by 30", () => {
    const { race, input } = alongsideAn("bully");
    let before = NaN;

    eventsUntil(race, () => ((before = player(race).stamina), input()), isSwingLandingOn(PLAYER), 30);

    expect(before).toBeGreaterThanOrEqual(30);
    expect(before - player(race).stamina).toBe(30);
  });
});
