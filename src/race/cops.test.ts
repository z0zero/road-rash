import { describe, expect, it } from "vitest";
import { createRace, PLAYER } from ".";
import { autopilot, eventsDuring, kmh, player, secondsUntil, startedRace } from "./test-helpers";

/** Metres between two things in track space: along the track and across it. */
const apart = (a: { distance: number; offset: number }, b: { distance: number; offset: number }) =>
  Math.hypot(a.distance - b.distance, a.offset - b.offset);

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
