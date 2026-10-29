import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type AttackKind, type RaceEvent, type RiderId, type RiderSnapshot } from ".";
import {
  alongsideARacer,
  autopilot,
  eventsDuring,
  eventsUntil,
  player,
  secondsUntil,
  startedRace,
  STEPS_PER_SECOND,
  withinReach,
} from "./test-helpers";

const ME = { kind: "rider", id: PLAYER } as const;
const rider = (id: RiderId) => ({ kind: "rider", id }) as const;

const byThePlayer = (event: RaceEvent) =>
  (event.type === "attack-thrown" || event.type === "attack-landed") && event.attacker.id === PLAYER;

/**
 * Keeps pressing punch while riding alongside the racer until one of the
 * player's punches lands; returns every event on the way.
 */
function punchTheRacer({ race, input }: ReturnType<typeof alongsideARacer>) {
  const punching = () => ({ ...input(), punch: true });
  return eventsUntil(race, punching, (event) => event.type === "attack-landed" && event.attacker.id === PLAYER, 2);
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

describe("attacks", () => {
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

  it("show in the attacker's snapshot: winding up towards the target's side, then recovering", () => {
    const { race, target, input } = alongsideARacer();
    const side = Math.sign(race.snapshot().riders[target].offset - player(race).offset);
    expect(player(race).attack).toBeNull();
    const stages: string[] = [];
    let progress = -1;

    race.step({ ...input(), punch: true });
    for (let step = 0; step < STEPS_PER_SECOND && player(race).attack; step++) {
      const attack = player(race).attack;
      expect(attack).toMatchObject({ kind: "punch", side });
      if (attack?.stage !== stages.at(-1)) [stages[stages.length], progress] = [attack?.stage ?? "", -1];
      expect(attack?.progress).toBeGreaterThan(progress);
      expect(attack?.progress).toBeLessThanOrEqual(1);
      progress = attack?.progress ?? NaN;
      race.step(input());
    }

    expect(stages).toEqual(["wind-up", "recovery"]);
    expect(player(race).attack).toBeNull();
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
    // Swings too, if the player takes a club from a bully on the way.
    const nearestWithinReach = (riders: readonly RiderSnapshot[], kind: AttackKind) =>
      riders
        .filter((other) => other.id !== PLAYER && other.status === "racing" && other.crash === null)
        .filter((other) => withinReach(riders[PLAYER], other, kind))
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
        (other) =>
          other.id !== PLAYER &&
          Math.hypot(other.distance - before[PLAYER].distance, other.offset - before[PLAYER].offset) < 4,
      );
      race.step({ ...pilot(), punch: near && step % 2 === 0, kick: near && step % 2 === 1 });
      const after = race.snapshot().riders;
      for (const event of race.drainEvents().filter(byThePlayer)) {
        if (event.type === "attack-thrown") {
          expect(event.target?.id ?? null).toBe(nearestWithinReach(before, event.kind));
          if (event.target) thrownAtSomeone++;
          else thrownAtNobody++;
        } else if (event.type === "attack-landed") {
          expect(event.target.id).toBe(nearestWithinReach(after, event.kind));
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
    const stamina = () => race.snapshot().riders[target].stamina;
    punchTheRacer(alongside);
    eventsDuring(race, 1.5, input);
    punchTheRacer(alongside);
    const afterTheLatestHit = stamina();
    expect(afterTheLatestHit).toBeLessThan(82);

    eventsDuring(race, 1.9, input);
    expect(stamina()).toBe(afterTheLatestHit);
    eventsDuring(race, 0.3, input);
    expect(stamina()).toBeGreaterThan(afterTheLatestHit);
  });
});

describe("knock-offs", () => {
  it("knock a rider with no stamina left off their bike with the next hit: a crash", () => {
    const alongside = alongsideARacer();
    const { race, target } = alongside;
    const them = () => race.snapshot().riders[target];
    // 100 - 6 x 18 leaves no stamina, but they stay on their bike...
    for (let punch = 0; punch < 6; punch++) {
      expect(punchTheRacer(alongside)).not.toContainEqual(expect.objectContaining({ type: "crash" }));
    }
    expect(them()).toMatchObject({ stamina: 0, crash: null });

    // ...until the next hit, which knocks them off at the speed they were riding.
    let speed = 0;
    const punching = () => ((speed = them().speed), { ...alongside.input(), punch: true });
    const events = eventsUntil(race, punching, (event) => event.type === "crash", 2);

    expect(events).toContainEqual({ type: "crash", rider: target, cause: "knocked-off", impactSpeed: expect.closeTo(speed, 0) });
    expect(them().crash).toBe("tumbling");
  });
});
