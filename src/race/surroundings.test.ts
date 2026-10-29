import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, type RaceSnapshot, type RiderSnapshot } from ".";
import { autopilot, startedRace, STEPS_PER_SECOND } from "./test-helpers";

/** Opponents still racing on their bikes. */
const opponentsRiding = ({ riders }: RaceSnapshot) =>
  riders.filter((rider) => rider.id !== PLAYER && rider.status === "racing" && rider.crash === null);

const apart = (a: RiderSnapshot, b: RiderSnapshot) => Math.hypot(a.distance - b.distance, a.offset - b.offset);

/**
 * Rides a race with the player passing the pack at full speed for a minute,
 * then easing right off so that the riders behind come back up past them,
 * and hands every snapshot to `watch`.
 */
function passThenEaseOff(watch: (snapshot: RaceSnapshot) => void) {
  const race = startedRace();
  const pilot = autopilot(race);
  for (let step = 0; step < 90 * STEPS_PER_SECOND; step++) {
    race.step(step < 60 * STEPS_PER_SECOND ? pilot() : { ...pilot(), throttle: 0, brake: 0.2 });
    watch(race.snapshot());
  }
}

describe("the player's surroundings", () => {
  it("name the opponent on their bike nearest the player, if one is within 50 m", () => {
    const named = new Set<number>();
    let nobody = 0;
    passThenEaseOff((snapshot) => {
      const me = snapshot.riders[PLAYER];
      const nearest = opponentsRiding(snapshot)
        .filter((other) => apart(other, me) <= 50)
        .sort((a, b) => apart(a, me) - apart(b, me))[0];
      expect(snapshot.nearestOpponent).toBe(nearest?.id ?? null);
      if (nearest) named.add(nearest.id);
      else nobody++;
    });

    expect(named.size).toBeGreaterThanOrEqual(5);
    expect(nobody).toBeGreaterThan(0);
  });

  it("warn of riders alongside the player, or coming up from behind, on the side they are on", () => {
    const warned = { left: 0, right: 0 };
    passThenEaseOff((snapshot) => {
      const me = snapshot.riders[PLAYER];
      const expected = { left: false, right: false };
      for (const other of opponentsRiding(snapshot)) {
        const behind = me.distance - other.distance;
        const alongside = Math.abs(behind) <= 3 && Math.abs(other.offset - me.offset) <= 4;
        const comingUp = behind > 0 && behind <= 30 && other.speed > me.speed;
        if (alongside || comingUp) expected[other.offset < me.offset ? "left" : "right"] = true;
      }
      expect(snapshot.warnings).toEqual(expected);
      if (expected.left) warned.left++;
      if (expected.right) warned.right++;
    });

    expect(warned.left).toBeGreaterThan(0);
    expect(warned.right).toBeGreaterThan(0);
  });

  it("are quiet while nobody is near, as on the start line", () => {
    const race = startedRace();
    race.step(NO_INPUT);

    expect(race.snapshot().warnings).toEqual({ left: false, right: false });
  });
});
