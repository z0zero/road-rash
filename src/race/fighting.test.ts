import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type Race, type RaceEvent, type RiderId, type RiderSnapshot } from ".";
import {
  autopilot,
  eventsDuring,
  player,
  rideAlongside,
  secondsUntil,
  startedRace,
  STEPS_PER_SECOND,
  withinReach,
} from "./test-helpers";

const ME = { kind: "rider", id: PLAYER } as const;
const rider = (id: RiderId) => ({ kind: "rider", id }) as const;

/** The racer (an opponent who rarely attacks) who lines up nearest the player. */
function nearestRacer(race: Race): RiderId {
  const { riders } = race.snapshot();
  return riders
    .filter((other) => other.temperament === "racer")
    .reduce((nearest, other) => (other.distance < nearest.distance ? other : nearest)).id;
}

/** A started race in which the player has ridden up alongside a racer, within reach of them. */
function alongsideARacer(seed = 1) {
  const race = startedRace(seed);
  const target = nearestRacer(race);
  const input = rideAlongside(race, target);
  secondsUntil(race, input, () => withinReach(player(race), race.snapshot().riders[target]), 60);
  race.drainEvents();
  return { race, target, input };
}

describe("punching", () => {
  it("lands on the nearest rider within reach and lowers their stamina by 18", () => {
    const { race, target, input } = alongsideARacer();
    expect(race.snapshot().riders[target].stamina).toBe(100);

    race.step({ ...input(), punch: true });
    const events = [...race.drainEvents(), ...eventsDuring(race, 0.5, input)];

    expect(events).toContainEqual({ type: "attack-thrown", attacker: ME, target: rider(target), kind: "punch" });
    expect(events).toContainEqual({ type: "attack-landed", attacker: ME, target: rider(target), kind: "punch" });
    expect(race.snapshot().riders[target].stamina).toBe(82);
  });
});

describe("attacks", () => {
  const byThePlayer = (event: RaceEvent) =>
    (event.type === "attack-thrown" || event.type === "attack-landed") && event.attacker.id === PLAYER;

  it("are aimed at nobody, and miss, when no rider is within reach", () => {
    const race = startedRace();
    race.step({ ...NO_INPUT, kick: true });
    const events = [...race.drainEvents(), ...eventsDuring(race, 1)];

    expect(events.filter(byThePlayer)).toEqual([{ type: "attack-thrown", attacker: ME, target: null, kind: "kick" }]);
  });

  it("strike at the end of a short wind-up: about 0.12 s for a punch and 0.25 s for a kick", () => {
    const windUp = (kind: "punch" | "kick") => {
      const { race, input } = alongsideARacer();
      race.step({ ...input(), [kind]: true });
      expect(race.drainEvents().filter(byThePlayer)).toHaveLength(1);
      return secondsUntil(race, input, () => race.drainEvents().some(byThePlayer), 1);
    };

    expect(windUp("punch")).toBeCloseTo(0.12, 1);
    expect(windUp("kick")).toBeGreaterThan(0.22);
    expect(windUp("kick")).toBeLessThan(0.28);
  });

  it("can't be thrown again until the last one has struck and a short recovery is over", () => {
    const { race, input } = alongsideARacer();
    const mashing = () => ({ ...input(), punch: true });

    const thrown = eventsDuring(race, 3, mashing).filter((event) => event.type === "attack-thrown" && byThePlayer(event));

    // Each punch takes its wind-up (about 0.12 s) and a short recovery: between 0.25 and 0.5 s in all.
    expect(thrown.length).toBeGreaterThanOrEqual(6);
    expect(thrown.length).toBeLessThanOrEqual(12);
  });

  it("land on the nearest rider within reach, on either side, and on nobody out of reach", () => {
    const race = startedRace();
    const pilot = autopilot(race, { lane: 2 });
    const nearestWithinReach = (riders: readonly RiderSnapshot[]) =>
      riders
        .filter((other) => other.id !== PLAYER && other.status === "racing" && withinReach(riders[PLAYER], other))
        .map((other) => ({
          id: other.id,
          apart: Math.hypot(other.distance - riders[PLAYER].distance, other.offset - riders[PLAYER].offset),
        }))
        .sort((a, b) => a.apart - b.apart)[0]?.id ?? null;
    const sides = new Set<number>();
    let [thrownAtSomeone, thrownAtNobody, landed] = [0, 0, 0];

    for (let step = 0; step < 120 * STEPS_PER_SECOND; step++) {
      const before = race.snapshot().riders;
      const near = before.some(
        (other) => other.id !== PLAYER && Math.hypot(other.distance - before[PLAYER].distance, other.offset - before[PLAYER].offset) < 4,
      );
      race.step({ ...pilot(), punch: near && step % 2 === 0, kick: near && step % 2 === 1 });
      const after = race.snapshot().riders;
      for (const event of race.drainEvents().filter(byThePlayer)) {
        if (event.type === "attack-thrown") {
          expect(event.target?.id ?? null).toBe(nearestWithinReach(before));
          if (event.target) thrownAtSomeone++;
          else thrownAtNobody++;
        } else if (event.type === "attack-landed") {
          expect(event.target.id).toBe(nearestWithinReach(after));
          sides.add(Math.sign(after[event.target.id].offset - after[PLAYER].offset));
          landed++;
        }
      }
    }

    expect(thrownAtSomeone).toBeGreaterThanOrEqual(5);
    expect(thrownAtNobody).toBeGreaterThanOrEqual(5);
    expect(landed).toBeGreaterThanOrEqual(5);
    expect(sides).toEqual(new Set([-1, 1]));
  });
});

/** Throws a punch at the racer alongside and rides on until it has landed. */
function punchTheRacer({ race, input }: ReturnType<typeof alongsideARacer>) {
  race.step({ ...input(), punch: true });
  secondsUntil(race, input, () => race.drainEvents().some((event) => event.type === "attack-landed"), 1);
}

describe("stamina", () => {
  it("starts recovering at 6 per second once a rider has gone 2 s without being hit, up to 100", () => {
    const alongside = alongsideARacer();
    const { race, target, input } = alongside;
    const stamina = () => race.snapshot().riders[target].stamina;
    punchTheRacer(alongside);
    expect(stamina()).toBe(82);

    eventsDuring(race, 1.9, input);
    expect(stamina()).toBe(82);
    eventsDuring(race, 1.1, input);
    expect(stamina()).toBeCloseTo(88, 0);
    eventsDuring(race, 2, input);
    expect(stamina()).toBeCloseTo(100, 0);
    eventsDuring(race, 2, input);
    expect(stamina()).toBe(100);
  });

  it("only starts recovering 2 s after the latest hit", () => {
    const alongside = alongsideARacer();
    const { race, target, input } = alongside;
    punchTheRacer(alongside);
    eventsDuring(race, 1.5, input);
    punchTheRacer(alongside);
    expect(race.snapshot().riders[target].stamina).toBe(64);

    eventsDuring(race, 1.9, input);

    expect(race.snapshot().riders[target].stamina).toBe(64);
  });
});

describe("kicking", () => {
  it("lowers the target's stamina by 6 and shoves them sideways at about 6 m/s, away from the kicker", () => {
    // Two identical races, ridden with the same input; in one of them the player kicks.
    const kicked = alongsideARacer();
    const spared = alongsideARacer();
    const { target } = kicked;
    const stepBoth = (kick = false) => {
      const input = spared.input();
      kicked.race.step({ ...input, kick });
      spared.race.step(input);
      return kicked.race.drainEvents();
    };
    let events = stepBoth(true);
    expect(events).toContainEqual({ type: "attack-thrown", attacker: ME, target: rider(target), kind: "kick" });
    while (!events.some((event) => event.type === "attack-landed")) events = stepBoth();
    expect(events).toContainEqual({ type: "attack-landed", attacker: ME, target: rider(target), kind: "kick" });
    const awayFromThePlayer = Math.sign(kicked.race.snapshot().riders[target].offset - player(kicked.race).offset);
    const offsets = () => [kicked, spared].map(({ race }) => race.snapshot().riders[target].offset);
    const [kickedBefore, sparedBefore] = offsets();
    stepBoth();
    const [kickedAfter, sparedAfter] = offsets();

    expect(kicked.race.snapshot().riders[target].stamina).toBe(94);
    const shove = ((kickedAfter - kickedBefore - (sparedAfter - sparedBefore)) / STEP_SECONDS) * awayFromThePlayer;
    expect(shove).toBeGreaterThan(5);
    expect(shove).toBeLessThan(7);
  });
});
