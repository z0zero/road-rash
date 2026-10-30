import { describe, expect, it } from "vitest";
import { createRace, NO_INPUT, PLAYER, type AttackKind, type RaceEvent, type RiderId } from ".";
import {
  alongsideAn,
  autopilot,
  eventsDuring,
  eventsUntil,
  nearestWithinReach,
  player,
  punchedMidSwing,
  rideAlongside,
  secondsUntil,
  startedRace,
  STEPS_PER_SECOND,
} from "./test-helpers";

type AttackThrown = Extract<RaceEvent, { type: "attack-thrown" }>;

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

    const holders = riders.filter((each) => each.weapon === "club");
    expect(holders.map((holder) => holder.temperament)).toEqual(["bully", "bully", "bully"]);
    expect(riders.filter((each) => each.weapon !== "club").every((other) => other.weapon === null)).toBe(true);
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

  it("are swung with a wind-up of about 0.3 s before the swing strikes", () => {
    const { race, target, input } = alongsideAn("bully");
    const them = () => race.snapshot().riders[target];
    eventsUntil(race, input, (event) => event.type === "attack-thrown" && event.attacker.id === target && event.kind === "club-swing", 30);

    const windUp = secondsUntil(race, input, () => them().attack?.stage !== "wind-up", 1);

    expect(them().attack).toMatchObject({ kind: "club-swing", stage: "recovery" });
    expect(windUp).toBeGreaterThan(0.25);
    expect(windUp).toBeLessThan(0.33);
  });

  it("are swung by the player's punch button once they hold one", () => {
    const { race, input } = punchedMidSwing();
    expect(player(race).weapon).toBe("club");

    race.step({ ...input(), punch: true });

    expect(race.drainEvents().filter((event) => event.type === "attack-thrown" && event.attacker.id === PLAYER)).toEqual([
      expect.objectContaining({ kind: "club-swing" }),
    ]);
  });

  it("reach riders up to 2.4 m to the side, further than a punch reaches, but no further", () => {
    /** The rider a swing is aimed at when the player throws it with the bully they took it from `low` to `high` metres to their side. */
    const aimedAt = (low: number, high: number) => {
      // A race in which nobody else comes near while the player, holding the club, edges away from the bully.
      const { race, target } = punchedMidSwing(3);
      const edgingAway = rideAlongside(race, target, { across: 3.2 });
      const aside = () => {
        const { riders } = race.snapshot();
        const [me, them] = [riders[PLAYER], riders[target]];
        const gap = Math.abs(them.offset - me.offset);
        const alone = riders.every(
          (other) => other.id === PLAYER || other.id === target || Math.hypot(other.distance - me.distance, other.offset - me.offset) > 3.5,
        );
        return me.weapon === "club" && me.attack === null && alone && gap >= low && gap <= high && Math.abs(them.distance - me.distance) < 1.5;
      };
      secondsUntil(race, edgingAway, aside, 10);
      race.drainEvents();
      race.step({ ...edgingAway(), punch: true });
      const thrown = race.drainEvents().find((event): event is AttackThrown => event.type === "attack-thrown" && event.attacker.id === PLAYER);
      expect(thrown?.kind).toBe("club-swing");
      return { target, aimedAt: thrown?.target };
    };

    const near = aimedAt(2.0, 2.3);
    expect(near.aimedAt).toEqual(rider(near.target));
    expect(aimedAt(2.5, 2.9).aimedAt).toBeNull();
  });
});

describe("holding a club", () => {
  it("lasts while the player keeps swinging it: opponents seldom throw a hit into a swing, so a holding usually lasts 10 s or more", () => {
    // Whole races in which the player rides on autopilot and mashes the punch button whenever anyone is within reach.
    const holdings: { seconds: number; stolen: boolean }[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const race = startedRace(seed);
      const riding = autopilot(race);
      let heldFrom: number | null = null;
      let { riders } = race.snapshot();
      for (let step = 0; riders[PLAYER].status === "racing" && step < 300 * STEPS_PER_SECOND; step++) {
        const me = riders[PLAYER];
        const someoneInReach = nearestWithinReach(riders, me, me.weapon === "club" ? "club-swing" : "punch") !== null;
        race.step({ ...riding(), punch: someoneInReach && step % 8 === 0 });
        const stolen = race.drainEvents().some((event) => event.type === "weapon-stolen" && event.from.id === PLAYER);
        ({ riders } = race.snapshot());
        const holding = riders[PLAYER].weapon === "club";
        if (holding && heldFrom === null) heldFrom = step;
        if (!holding && heldFrom !== null) {
          holdings.push({ seconds: (step - heldFrom) / STEPS_PER_SECOND, stolen });
          heldFrom = null;
        }
      }
      // Held to the end of the player's race.
      if (heldFrom !== null) holdings.push({ seconds: Infinity, stolen: false });
    }

    expect(holdings.length).toBeGreaterThanOrEqual(5);
    expect(holdings.filter((holding) => holding.seconds >= 10).length).toBeGreaterThanOrEqual(0.75 * holdings.length);
    expect(holdings.filter((holding) => holding.stolen).length).toBeLessThanOrEqual(0.25 * holdings.length);
  });
});

describe("stealing a club", () => {
  it("takes it from its holder with a hit thrown early in their swing's wind-up, which then never lands", () => {
    const { race, target, events } = punchedMidSwing();

    expect(events).toContainEqual({ type: "attack-landed", attacker: ME, target: rider(target), kind: "punch" });
    expect(events).toContainEqual({ type: "weapon-stolen", from: rider(target), by: ME });
    expect(player(race).weapon).toBe("club");
    expect(race.snapshot().riders[target].weapon).toBeNull();
    expect(events.filter(isSwingLandingOn(PLAYER))).toEqual([]);
  });

  it("takes it with a hit thrown at any moment of the wind-up, even late in it: the hit lands after the swing has struck", () => {
    const { race, target, input } = alongsideAn("bully");
    const lateInTheWindUp = () => {
      const attack = race.snapshot().riders[target].attack;
      return attack?.kind === "club-swing" && attack.stage === "wind-up" && attack.progress >= 0.8;
    };
    secondsUntil(race, input, lateInTheWindUp, 30);
    race.drainEvents();

    // Thrown about 0.25 s into the 0.3 s wind-up, a punch takes a little over 0.1 s to land, after the swing strikes.
    race.step({ ...input(), punch: true });
    const events = [...race.drainEvents(), ...eventsDuring(race, 0.25, input)];

    const punchLanded = events.findIndex((event) => event.type === "attack-landed" && event.attacker.id === PLAYER);
    const swingLanded = events.findIndex((event) => event.type === "attack-landed" && event.attacker.id === target);
    expect(swingLanded).toBeGreaterThanOrEqual(0);
    expect(punchLanded).toBeGreaterThan(swingLanded);
    expect(events).toContainEqual({ type: "weapon-stolen", from: rider(target), by: ME });
    expect(player(race).weapon).toBe("club");
    expect(race.snapshot().riders[target].weapon).toBeNull();
  });

  it("doesn't happen with a hit thrown after the swing has struck", () => {
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

describe("dropping a club", () => {
  it("happens to a holder who crashes: nobody gets the club, and their punches are punches again", () => {
    // The player takes the bully's club, then rides on alongside it without attacking until it knocks them off.
    const { race, input } = punchedMidSwing();
    const clubs = () => race.snapshot().riders.filter((each) => each.weapon === "club").length;
    const clubsBefore = clubs();

    eventsUntil(race, input, (event) => event.type === "crash" && event.rider === PLAYER, 30);

    expect(player(race).weapon).toBeNull();
    expect(clubs()).toBe(clubsBefore - 1);

    eventsUntil(race, NO_INPUT, (event) => event.type === "remounted" && event.rider === PLAYER, 10);
    race.step({ ...NO_INPUT, punch: true });

    expect(player(race).weapon).toBeNull();
    expect(thrownBy(PLAYER, race.drainEvents())).toEqual(["punch"]);
  });
});
