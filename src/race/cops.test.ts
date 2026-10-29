import { describe, expect, it } from "vitest";
import { createRace, PLAYER, type PlayerInput, type Race, type RaceEvent, type RiderId } from ".";
import { alongsideARacer, autopilot, eventsDuring, eventsUntil, kmh, player, secondsUntil, startedRace } from "./test-helpers";

/** Metres between two things in track space: along the track and across it. */
const apart = (a: { distance: number; offset: number }, b: { distance: number; offset: number }) =>
  Math.hypot(a.distance - b.distance, a.offset - b.offset);

/**
 * A started race in which the player has ridden alongside a racer (an
 * opponent who rarely attacks) until they have just passed the first cop, so
 * that it has joined the race.
 */
function alongsideARacerPastTheFirstCop(seed = 1) {
  const alongside = alongsideARacer(seed);
  const { race, input } = alongside;
  const cop = race.snapshot().cops[0];
  secondsUntil(race, input, () => player(race).distance >= cop.distance, 120);
  race.drainEvents();
  return alongside;
}

/**
 * Rides with `input`, punching the opponent `target` down to no stamina and
 * keeping it there, until `when` holds; then punches it off its bike. Returns
 * every event on the way, its crash last.
 */
function knockOffWhen(race: Race, target: RiderId, input: () => PlayerInput, when: () => boolean) {
  const punching = () => ({ ...input(), punch: race.snapshot().riders[target].stamina > 0 || when() });
  return eventsUntil(race, punching, (event) => event.type === "crash" && event.rider === target, 30);
}

describe("busting", () => {
  it("is what a cop does to a rider who crashes within 80 m of it, riding to them before they get back on their bike", () => {
    const { race, target, input } = alongsideARacerPastTheFirstCop();
    const cop = () => race.snapshot().cops[0];
    const them = () => race.snapshot().riders[target];
    // Knocked off with the cop close behind.
    knockOffWhen(race, target, input, () => them().distance - cop().distance > 5);
    expect(apart(cop(), them())).toBeLessThan(80);

    const events = eventsUntil(race, input, (event) => event.type === "busted", 10);

    expect(events.at(-1)).toEqual({ type: "busted", rider: target, cop: 0 });
    expect(events).not.toContainEqual({ type: "remounted", rider: target });
    expect(apart(cop(), them())).toBeLessThan(3);
  });

  it("takes a busted opponent out of the race for good, with no position", () => {
    const { race, target, input } = alongsideARacerPastTheFirstCop();
    const cop = () => race.snapshot().cops[0];
    const them = () => race.snapshot().riders[target];
    knockOffWhen(race, target, input, () => them().distance - cop().distance > 5);
    eventsUntil(race, input, (event) => event.type === "busted", 10);

    expect(them()).toMatchObject({ status: "busted", position: null });
    const positions = race.snapshot().riders.flatMap((rider) => (rider.position === null ? [] : [rider.position]));
    expect(positions.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    const later = eventsDuring(race, 20, input);

    expect(later.filter((event: RaceEvent) => "rider" in event && event.rider === target)).toEqual([]);
    expect(them()).toMatchObject({ status: "busted", position: null });
  });
});

describe("cops", () => {
  it("wait on the shoulder, one about 1.8 km and the other about 4.5 km along the race, with 150 stamina each", () => {
    const race = createRace({ seed: 1 });
    const { roadHalfWidth, shoulderWidth, startDistance } = race.track;

    const { cops } = race.snapshot();

    expect(cops.map((cop) => cop.status)).toEqual(["waiting", "waiting"]);
    expect(cops[0].distance - startDistance).toBeCloseTo(1800, -2);
    expect(cops[1].distance - startDistance).toBeCloseTo(4500, -2);
    for (const cop of cops) {
      expect(Math.abs(cop.offset)).toBeGreaterThan(roadHalfWidth);
      expect(Math.abs(cop.offset)).toBeLessThanOrEqual(roadHalfWidth + shoulderWidth);
      expect(cop).toMatchObject({ speed: 0, stamina: 150, crash: null });
    }
    expect(new Set(cops.map((cop) => cop.name)).size).toBe(2);
  });

  it("stay where they wait until the player passes them, then join the race", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const [first, second] = race.snapshot().cops;
    const stillWaiting = () => {
      expect(race.snapshot().cops).toEqual([first, second]);
      return pilot();
    };

    secondsUntil(race, stillWaiting, () => player(race).distance >= first.distance, 120);

    expect(race.snapshot().cops.map((cop) => cop.status)).toEqual(["riding", "waiting"]);
    eventsDuring(race, 3, pilot);
    expect(race.snapshot().cops[0].distance).toBeGreaterThan(first.distance + 20);
    expect(race.snapshot().cops[1]).toEqual(second);
  });

  it("chase down a player who passes them at speed, at up to 66 m/s, faster than any bike, and stay within 150 m of them", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const second = race.snapshot().cops[1];
    secondsUntil(race, pilot, () => player(race).distance >= second.distance, 300);
    expect(player(race).speed).toBeGreaterThan(40);
    let fastest = 0;
    let furthest = 0;

    eventsDuring(race, 60, () => {
      const { riders, cops } = race.snapshot();
      fastest = Math.max(fastest, cops[1].speed);
      furthest = Math.max(furthest, apart(cops[1], riders[PLAYER]));
      return pilot();
    });

    expect(fastest).toBeGreaterThan(kmh(225));
    expect(fastest).toBeLessThanOrEqual(66 + 1e-9);
    expect(furthest).toBeLessThanOrEqual(150);
  });
});
