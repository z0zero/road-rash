import { describe, expect, it } from "vitest";
import { createRace, PLAYER } from ".";

describe("the start", () => {
  it("puts the player last in a field of fifteen riders", () => {
    const { riders } = createRace({ seed: 1 }).snapshot();

    expect(riders).toHaveLength(15);
    expect(riders[PLAYER].position).toBe(15);
    expect(riders.map((rider) => rider.position).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});

/** Sizes of the groups riders form along the track: riders less than `within` metres apart ride together. */
function groupSizes(distances: readonly number[], within: number) {
  const sorted = [...distances].sort((a, b) => a - b);
  const sizes = [1];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < within) sizes[sizes.length - 1]++;
    else sizes.push(1);
  }
  return sizes;
}

/** The riders' ids from the front of the field to the back. */
function startOrder(seed: number) {
  const { riders } = createRace({ seed }).snapshot();
  return [...riders].sort((a, b) => b.distance - a.distance).map((rider) => rider.id);
}

describe("the start, whatever the seed", () => {
  const seeds = [1, 2, 3, 4, 5, 42, 2024, 777_777];

  it("strings the fourteen opponents out in small groups over the first 400 m ahead of the player", () => {
    for (const seed of seeds) {
      const { riders } = createRace({ seed }).snapshot();
      const start = riders[PLAYER].distance;
      const ahead = riders.filter((rider) => rider.id !== PLAYER).map((rider) => rider.distance - start);

      expect(ahead).toHaveLength(14);
      for (const gap of ahead) {
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThanOrEqual(400);
      }
      expect(Math.max(...ahead)).toBeGreaterThan(300);
      const groups = groupSizes(ahead, 15);
      expect(groups.length).toBeGreaterThanOrEqual(4);
      expect(Math.min(...groups)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...groups)).toBeLessThanOrEqual(4);
    }
  });

  it("lines every rider up on the road, in the lanes that run in the race direction, clear of each other", () => {
    for (const seed of seeds) {
      const race = createRace({ seed });
      const { riders } = race.snapshot();

      for (const rider of riders) {
        expect(rider.offset).toBeGreaterThan(0);
        expect(rider.offset).toBeLessThan(race.track.roadHalfWidth);
      }
      for (const a of riders) {
        for (const b of riders) {
          if (a.id >= b.id) continue;
          const clear = Math.abs(a.distance - b.distance) >= 2.5 || Math.abs(a.offset - b.offset) >= 1.2;
          expect(clear, `riders ${a.id} and ${b.id} start on top of each other`).toBe(true);
        }
      }
    }
  });

  it("draws the start order from the seed", () => {
    expect(startOrder(1)).toEqual(startOrder(1));
    expect(new Set([1, 2, 3].map((seed) => startOrder(seed).join(","))).size).toBe(3);
    for (const seed of [1, 2, 3]) expect(startOrder(seed).at(-1)).toBe(PLAYER);
  });
});

/** Rider and cop names from the rosters of Road Rash, Road Rash II and Road Rash 3 (from the series research). */
const ROAD_RASH_NAMES = [
  "Natasha", "Biff", "Ikira", "Slater", "Sergio", "Helldog", "Jorg", "Sven", "Public Enemy", "P.E. No",
  "Kakana", "Lawson", "War Hammer", "Chino", "Roz I Ryde", "Shiva", "Viper", "Grubb", "Gunther", "Odie",
  "Lucky Luc", "Belladon", "Scab Boy", "Rhonda", "Axle", "Pearl", "Slim", "Nina", "Bolo", "Walleye",
  "Madame X", "Helmut", "Fang", "Polygon", "O'Leary", "Rourke", "Flynn", "O'Shea", "O'Connor", "Marshall",
  "Kelly", "Ortega",
];

describe("the opponents", () => {
  const { riders } = createRace({ seed: 1 }).snapshot();
  const opponents = riders.filter((rider) => rider.id !== PLAYER);

  it("have original nicknames, none taken from Road Rash's rosters", () => {
    const names = opponents.map((opponent) => opponent.name);

    expect(new Set(names).size).toBe(14);
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(2);
      for (const taken of ROAD_RASH_NAMES) expect(name.toLowerCase()).not.toContain(taken.toLowerCase());
    }
  });

  it("are racers, brawlers and bullies, and three of them are bullies", () => {
    const temperaments = opponents.map((opponent) => opponent.temperament);

    expect(new Set(temperaments)).toEqual(new Set(["racer", "brawler", "bully"]));
    expect(temperaments.filter((temperament) => temperament === "bully")).toHaveLength(3);
    expect(riders[PLAYER].temperament).toBeNull();
  });

  it("are the same fourteen riders in every race, whatever their start order", () => {
    const other = createRace({ seed: 99 }).snapshot().riders;

    expect(other.map(({ id, name, temperament }) => ({ id, name, temperament }))).toEqual(
      riders.map(({ id, name, temperament }) => ({ id, name, temperament })),
    );
  });
});
