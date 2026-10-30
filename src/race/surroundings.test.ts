import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, type RaceOptions, type RaceSnapshot, type RiderOrCop } from ".";
import { autopilot, CLOSED_ROAD, NO_COPS, startedRace, STEPS_PER_SECOND } from "./test-helpers";

/** Opponents still racing on their bikes. */
const opponentsRiding = ({ riders }: RaceSnapshot) =>
  riders.filter((rider) => rider.id !== PLAYER && rider.status === "racing" && rider.crash === null);

type Place = { readonly distance: number; readonly offset: number };

const apart = (a: Place, b: Place) => Math.hypot(a.distance - b.distance, a.offset - b.offset);

/**
 * Rides a race on a closed road (set up with `options` besides the seed),
 * with the player passing the pack at full speed for a minute, then easing
 * right off so that the riders behind come back up past them, and hands every
 * snapshot to `watch`. The road is closed so that no car holds the player up
 * behind the pack.
 */
function passThenEaseOff(watch: (snapshot: RaceSnapshot) => void, options: Omit<RaceOptions, "seed"> = {}) {
  const race = startedRace(1, { ...CLOSED_ROAD, ...options });
  const pilot = autopilot(race);
  for (let step = 0; step < 90 * STEPS_PER_SECOND; step++) {
    race.step(step < 60 * STEPS_PER_SECOND ? pilot() : { ...pilot(), throttle: 0, brake: 0.2 });
    watch(race.snapshot());
  }
}

describe("the player's surroundings", () => {
  /** Who the HUD should name in a snapshot: the opponent on their bike, or the cop in the race, nearest the player within 50 m. */
  function nearestWithin50m(snapshot: RaceSnapshot): RiderOrCop | null {
    const me = snapshot.riders[PLAYER];
    const candidates: { who: RiderOrCop; at: Place }[] = [
      ...opponentsRiding(snapshot).map((rider) => ({ who: { kind: "rider", id: rider.id } as const, at: rider })),
      ...snapshot.cops.filter((cop) => cop.status === "riding").map((cop) => ({ who: { kind: "cop", id: cop.id } as const, at: cop })),
    ];
    const within = candidates.filter(({ at }) => apart(at, me) <= 50);
    return within.sort((a, b) => apart(a.at, me) - apart(b.at, me))[0]?.who ?? null;
  }

  it("name the opponent on their bike nearest the player, if one is within 50 m", () => {
    const named = new Set<number>();
    let nobody = 0;
    // With no cops, one of whom would be near the player from the first one on.
    passThenEaseOff((snapshot) => {
      const nearest = nearestWithin50m(snapshot);
      expect(snapshot.nearestOpponentOrCop).toEqual(nearest);
      if (nearest) named.add(nearest.id);
      else nobody++;
    }, NO_COPS);

    expect(named.size).toBeGreaterThanOrEqual(5);
    expect(nobody).toBeGreaterThan(0);
  });

  it("name the cop in the race instead when it is the nearest", () => {
    let copNamed = 0;
    passThenEaseOff((snapshot) => {
      const nearest = nearestWithin50m(snapshot);
      expect(snapshot.nearestOpponentOrCop).toEqual(nearest);
      if (nearest?.kind === "cop") copNamed++;
    });

    expect(copNamed).toBeGreaterThan(0);
  });

  it("warn of riders and cops alongside the player, or coming up from behind, on the side they are on", () => {
    const warned = { left: 0, right: 0, ofACop: 0 };
    passThenEaseOff((snapshot) => {
      const me = snapshot.riders[PLAYER];
      const expected = { left: false, right: false };
      const copsRiding = snapshot.cops.filter((cop) => cop.status === "riding");
      for (const other of [...opponentsRiding(snapshot), ...copsRiding]) {
        const behind = me.distance - other.distance;
        const alongside = Math.abs(behind) <= 3 && Math.abs(other.offset - me.offset) <= 4;
        const comingUp = behind > 0 && behind <= 30 && other.speed > me.speed;
        if (!alongside && !comingUp) continue;
        expected[other.offset < me.offset ? "left" : "right"] = true;
        if (copsRiding.includes(other as (typeof copsRiding)[number])) warned.ofACop++;
      }
      expect(snapshot.warnings).toEqual(expected);
      if (expected.left) warned.left++;
      if (expected.right) warned.right++;
    });

    expect(warned.left).toBeGreaterThan(0);
    expect(warned.right).toBeGreaterThan(0);
    expect(warned.ofACop).toBeGreaterThan(0);
  });

  it("are quiet while nobody is near, as on the start line", () => {
    const race = startedRace();
    race.step(NO_INPUT);

    expect(race.snapshot().warnings).toEqual({ left: false, right: false });
  });
});
