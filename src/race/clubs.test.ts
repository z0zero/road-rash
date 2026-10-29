import { describe, expect, it } from "vitest";
import { createRace, PLAYER, type AttackKind, type RaceEvent, type RiderId } from ".";
import { alongsideAn, eventsDuring, eventsUntil, player, punchedMidSwing, secondsUntil } from "./test-helpers";

const ME = { kind: "rider", id: PLAYER } as const;
const rider = (id: RiderId) => ({ kind: "rider", id }) as const;

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

describe("stealing a club", () => {
  it("takes it from its holder with a hit landing in the middle of their swing, which then never lands", () => {
    const { race, target, events } = punchedMidSwing();

    expect(events).toContainEqual({ type: "attack-landed", attacker: ME, target: rider(target), kind: "punch" });
    expect(events).toContainEqual({ type: "weapon-stolen", from: rider(target), by: ME });
    expect(player(race).weapon).toBe("club");
    expect(race.snapshot().riders[target].weapon).toBeNull();
    expect(events.filter(isSwingLandingOn(PLAYER))).toEqual([]);
  });

  it("doesn't happen with a hit landing after the swing has struck", () => {
    const { race, target, input } = alongsideAn("bully");
    const swingJustStruck = () => {
      const attack = race.snapshot().riders[target].attack;
      return attack?.kind === "club-swing" && attack.stage === "recovery" && attack.progress < 0.2;
    };
    secondsUntil(race, input, swingJustStruck, 30);
    race.drainEvents();

    // A punch thrown as the swing strikes lands a little over 0.1 s later, while the bully is still recovering.
    race.step({ ...input(), punch: true });
    const events = [...race.drainEvents(), ...eventsDuring(race, 0.25, input)];

    expect(events).toContainEqual({ type: "attack-landed", attacker: ME, target: rider(target), kind: "punch" });
    expect(events.filter((event) => event.type === "weapon-stolen")).toEqual([]);
    expect(race.snapshot().riders[target].weapon).toBe("club");
  });

  it("doesn't happen with hits landing on a holder who isn't swinging", () => {
    // The player takes the bully's club, then rides on alongside it without attacking while it fights back.
    const { race, input } = punchedMidSwing();
    expect(player(race).weapon).toBe("club");
    const events: RaceEvent[] = [];
    const hitsTaken = () => events.filter((event) => event.type === "attack-landed" && event.target.id === PLAYER).length;

    secondsUntil(race, input, () => (events.push(...race.drainEvents()), hitsTaken() >= 3), 20);

    expect(events.filter((event) => event.type === "weapon-stolen")).toEqual([]);
    expect(player(race).weapon).toBe("club");
  });
});
