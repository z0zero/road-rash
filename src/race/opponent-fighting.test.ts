import { describe, expect, it } from "vitest";
import { PLAYER, STEP_SECONDS, type PlayerInput, type Race, type Temperament } from ".";
import { alongsideARacer, autopilot, nearestWithinReach, player, startedRace } from "./test-helpers";

/** Seconds an opponent spent free to attack with someone within reach, and the attacks it threw in that time. */
interface Tally {
  seconds: number;
  attacks: number;
}

/** Tallies by temperament, for when the nearest rider within an opponent's reach was the player, and when it was another opponent. */
type Tallies = Record<"player" | "opponent", Record<Temperament, Tally>>;

const emptyTallies = (): Tallies => ({
  player: { racer: { seconds: 0, attacks: 0 }, brawler: { seconds: 0, attacks: 0 }, bully: { seconds: 0, attacks: 0 } },
  opponent: { racer: { seconds: 0, attacks: 0 }, brawler: { seconds: 0, attacks: 0 }, bully: { seconds: 0, attacks: 0 } },
});

/**
 * Rides `race` with `input` for up to `seconds`, or until the player's race is
 * over, and tallies, at every step, each opponent on its bike and not already
 * attacking that has someone within reach: whether the nearest of them is the
 * player or another opponent, and whether the opponent attacks.
 */
function tallyAttacks(tallies: Tallies, race: Race, input: () => PlayerInput, seconds: number) {
  for (let step = 0; step < seconds / STEP_SECONDS && player(race).status === "racing"; step++) {
    const before = race.snapshot().riders;
    const free = before.filter((rider) => rider.temperament && rider.status === "racing" && !rider.crash && !rider.attack);
    const nearest = free.map((rider) => nearestWithinReach(before, rider));
    race.step(input());
    const attackers = new Set(race.drainEvents().flatMap((event) => (event.type === "attack-thrown" ? [event.attacker.id] : [])));
    free.forEach((rider, index) => {
      if (nearest[index] === null || !rider.temperament) return;
      const tally = tallies[nearest[index] === PLAYER ? "player" : "opponent"][rider.temperament];
      tally.seconds += STEP_SECONDS;
      if (attackers.has(rider.id)) tally.attacks++;
    });
  }
}

/** Attacks per second of having someone within reach. */
const rate = ({ seconds, attacks }: Tally) => attacks / seconds;

describe("opponents", () => {
  // Three races ridden at the field's pace, so the opponents get plenty of chances to attack the player and each other,
  // and a long ride alongside a racer, since racers don't come looking for a fight.
  const tallies = emptyTallies();
  for (const seed of [1, 2, 3]) {
    const race = startedRace(seed);
    tallyAttacks(tallies, race, autopilot(race, { targetSpeed: 48 }), 300);
  }
  const alongside = alongsideARacer();
  tallyAttacks(tallies, alongside.race, alongside.input, 60);

  it("attack the player often if they are brawlers or bullies", () => {
    for (const temperament of ["brawler", "bully"] as const) {
      expect(tallies.player[temperament].seconds).toBeGreaterThan(10);
      expect(rate(tallies.player[temperament])).toBeGreaterThan(0.8);
    }
  });

  it("rarely attack the player if they are racers", () => {
    expect(tallies.player.racer.seconds).toBeGreaterThan(20);
    expect(rate(tallies.player.racer)).toBeLessThan(0.25);
  });

  it("attack the player far more readily than each other, but now and then each other too", () => {
    for (const temperament of ["brawler", "bully"] as const) {
      expect(tallies.opponent[temperament].seconds).toBeGreaterThan(10);
      expect(rate(tallies.player[temperament])).toBeGreaterThan(4 * rate(tallies.opponent[temperament]));
      expect(tallies.opponent[temperament].attacks).toBeGreaterThan(0);
    }
  });
});
