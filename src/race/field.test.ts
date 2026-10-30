import { describe, expect, it } from "vitest";
import {
  createRace,
  NO_INPUT,
  PLAYER,
  type PlayerInput,
  type Race,
  type RaceEvent,
  type RiderSnapshot,
  type Track,
} from ".";
import {
  autopilot,
  bendSpeed,
  chase,
  CLOSED_ROAD,
  nearestOpponent,
  nearestWithinReach,
  NO_COPS,
  player,
  rideAlongside,
  secondsUntil,
  setUpRace,
  startedRace,
  stepFor,
  steerOnto,
  steerTowards,
  STEPS_PER_SECOND,
  type TestSetup,
  WHOLE_RACES,
} from "./test-helpers";

type RiderFinished = Extract<RaceEvent, { type: "rider-finished" }>;

/** Distances of the tightest point of each hairpin (a bend tighter than 30 m) between the start and the finish. */
function hairpinApexes(track: Track) {
  const apexes: number[] = [];
  for (let d = track.startDistance; d <= track.finishDistance; d++) {
    const curvature = Math.abs(track.sampleAt(d).curvature);
    const tightest = [-1, 1].every((step) => Math.abs(track.sampleAt(d + step).curvature) <= curvature);
    if (curvature >= 1 / 30 && tightest && !apexes.some((apex) => d - apex < 100)) apexes.push(d);
  }
  return apexes;
}

/**
 * Leaves the player on the start line and lets the opponents race for up to
 * `seconds`, calling `watch` with every snapshot and the events of its step;
 * returns the rider-finished events in the order they came.
 */
function raceWithoutThePlayer(
  seed: number,
  seconds: number,
  watch: (riders: readonly RiderSnapshot[], events: readonly RaceEvent[]) => void = () => {},
) {
  const race = startedRace(seed);
  const finished: RiderFinished[] = [];
  for (let step = 0; step < seconds * STEPS_PER_SECOND && finished.length < 14; step++) {
    race.step(NO_INPUT);
    const events = race.drainEvents();
    watch(race.snapshot().riders, events);
    for (const event of events) if (event.type === "rider-finished") finished.push(event);
  }
  return { race, finished };
}

/**
 * A started race on a closed road with no cops, set up besides as `setup`
 * says, in which the player has kicked the racer who lined up nearest them off
 * the road, ahead of a sign on the shoulder, and ridden beside it on its
 * inside, so that it can't come back onto the road, until it has stopped
 * behind the sign, or behind whatever stands there; the player is beside it,
 * all but stopped too.
 */
function pinnedBehindASign(setup: TestSetup = {}) {
  const race = startedRace(8, { ...CLOSED_ROAD, ...NO_COPS, ...setup });
  const target = nearestOpponent(race, "racer");
  const them = () => race.snapshot().riders[target];
  const alongside = rideAlongside(race, target);
  secondsUntil(race, alongside, () => nearestWithinReach(race.snapshot().riders, player(race)) === target, 60);
  const signAhead = () =>
    race.track.obstacles.find(({ kind, offset, distance }) => kind === "sign" && offset > 6.5 && distance - them().distance > 80 && distance - them().distance < 200);
  secondsUntil(race, alongside, () => signAhead() !== undefined, 60);
  const sign = signAhead();
  if (!sign) throw new Error("no sign on the shoulder ahead");
  secondsUntil(race, () => ({ ...alongside(), kick: player(race).attack === null }), () => them().offset > 7, 10);
  secondsUntil(race, rideAlongside(race, target, { across: 3.5 }), () => them().speed < 0.5, 30);
  expect(them()).toMatchObject({ status: "racing", crash: null });
  expect(them().offset).toBeGreaterThan(race.track.roadHalfWidth);
  expect(sign.distance - them().distance).toBeLessThan(5);
  return { race, them, sign };
}

/**
 * Rides a started race (set up as `setup` says) with
 * `makeInput`'s input until the player's race is over, then fast-forwards
 * it; collects every event on the way.
 */
function rideToTheResults(
  seed: number,
  makeInput: (race: Race) => () => PlayerInput,
  setup: TestSetup = {},
) {
  const race = startedRace(seed, setup);
  const input = makeInput(race);
  const events: RaceEvent[] = [];
  secondsUntil(race, input, () => {
    events.push(...race.drainEvents());
    return player(race).status !== "racing";
  });
  const results = race.fastForward();
  events.push(...race.drainEvents());
  return { race, results, events };
}

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

  it("race to the finish line by themselves, in finishing order", WHOLE_RACES, () => {
    const { finished } = raceWithoutThePlayer(1, 300);

    expect(finished.map((event) => event.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(new Set(finished.map((event) => event.rider)).size).toBe(14);
    expect(finished.map((event) => event.rider)).not.toContain(PLAYER);
    const times = finished.map((event) => event.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // About 7 km at racing speed: between two and four minutes.
    expect(times[0]).toBeGreaterThan(120);
    expect(times[13]).toBeLessThan(240);
  });

  it("stay on the road all the way, unless a kick shoves them off it for a moment, slowing down for the hairpins", () => {
    const { track } = createRace({ seed: 1 });
    const apexes = hairpinApexes(track);
    const fastest = new Map<number, number>();
    const atApexes = new Map<number, number[]>();
    const offTheRoad = new Set<string>();
    let previous: readonly RiderSnapshot[] | null = null;
    let step = 0;
    const kickedAt = new Map<number, number>();

    raceWithoutThePlayer(1, 300, (riders, events) => {
      step++;
      for (const event of events) {
        if (event.type === "attack-landed" && event.kind === "kick") kickedAt.set(event.target.id, step);
      }
      for (const rider of riders) {
        if (rider.id === PLAYER || rider.status !== "racing" || rider.crash !== null) continue;
        // A kick can carry a rider a few metres, onto the shoulder, before they steer back.
        const justKicked = step - (kickedAt.get(rider.id) ?? -Infinity) < 3 * STEPS_PER_SECOND;
        if (Math.abs(rider.offset) > track.roadHalfWidth && !justKicked) {
          offTheRoad.add(`${rider.name} at ${rider.distance.toFixed(0)} m`);
        }
        fastest.set(rider.id, Math.max(fastest.get(rider.id) ?? 0, rider.speed));
        const before = previous?.[rider.id].distance ?? rider.distance;
        for (const apex of apexes) {
          if (before < apex && rider.distance >= apex) atApexes.set(rider.id, [...(atApexes.get(rider.id) ?? []), rider.speed]);
        }
      }
      previous = riders;
    });

    expect([...offTheRoad]).toEqual([]);
    expect(apexes.length).toBeGreaterThanOrEqual(3);
    for (const [id, speeds] of atApexes) {
      expect(speeds).toHaveLength(apexes.length);
      for (const speed of speeds) expect(speed).toBeLessThan(0.6 * (fastest.get(id) ?? 0));
    }
    expect(atApexes.size).toBe(14);
  });

  it("get going again from a standstill behind a roadside sign on the shoulder, once nobody rides beside them", () => {
    const { race, them } = pinnedBehindASign();

    const pilot = autopilot(race, { lane: 1.5 });
    const seconds = secondsUntil(race, pilot, () => them().speed > 5 && them().offset < race.track.roadHalfWidth, 20);

    expect(seconds).toBeLessThan(10);
  });

  it("squeeze past a rider who stands beside them from a standstill behind a roadside sign on the shoulder, at walking pace", () => {
    const { race, them, sign } = pinnedBehindASign();
    const besideThem = player(race);

    // The player stands still beside the racer, on its inside.
    const seconds = secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => them().distance > sign.distance + 2 && them().speed > 5, 20);

    expect(seconds).toBeLessThan(5);
    expect(player(race).distance).toBeCloseTo(besideThem.distance, 1);
    expect(them()).toMatchObject({ status: "racing", crash: null });
  });

  it("get round a player who stops dead in their lane in front of them as they get going again from a standstill on the shoulder", () => {
    // A car pulled over onto the shoulder beside the sign the racer is pinned behind, so that it can't squeeze past it
    // while the player stands beside it.
    const { obstacles, startDistance } = setUpRace({ seed: 8 }, CLOSED_ROAD).track;
    const sign = obstacles.find(({ kind, offset, distance }) => kind === "sign" && offset > 6.5 && distance > startDistance + 800);
    const { race, them } = pinnedBehindASign({ parkedCars: [{ distance: sign?.distance ?? NaN, offset: 7.8 }] });
    stepFor(race, 1, { ...NO_INPUT, brake: 1 });
    // The player rolls on, out of the racer's reach, and stops dead in the outer lane, in the racer's way back onto the road.
    let lastOffset = player(race).offset;
    const rollingOn = (): PlayerInput => {
      const me = player(race);
      const sideways = (me.offset - lastOffset) * STEPS_PER_SECOND;
      lastOffset = me.offset;
      const far = me.distance - them().distance >= 4;
      return far ? { ...steerOnto(me, 5.5, 0, sideways), throttle: 0, brake: 1 } : steerOnto(me, 5.5, 2, sideways);
    };
    secondsUntil(race, rollingOn, () => player(race).speed === 0 && player(race).distance - them().distance >= 4, 10);
    const stoppedAt = player(race);

    const seconds = secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => them().distance > player(race).distance + 3 && them().speed > 5, 20);

    expect(seconds).toBeLessThan(5);
    expect(Math.abs(player(race).distance - stoppedAt.distance)).toBeLessThan(0.5);
  });

  it("ride at their own pace, so faster riders pass slower ones", () => {
    const start = startOrder(1).filter((id) => id !== PLAYER);

    const { finished } = raceWithoutThePlayer(1, 300);

    const finish = finished.map((event) => event.rider);
    const passes = start.flatMap((id, front) => start.slice(front + 1).filter((behind) => finish.indexOf(behind) < finish.indexOf(id)));
    expect(passes.length).toBeGreaterThanOrEqual(10);
  });

  it("steer around each other: no two opponents ever ride into each other, unless a kick shoves one into another", WHOLE_RACES, () => {
    for (const seed of [1, 2, 3]) {
      let overlaps = 0;
      let step = 0;
      const kickedAt = new Map<number, number>();
      raceWithoutThePlayer(seed, 300, (riders, events) => {
        step++;
        for (const event of events) {
          if (event.type === "attack-landed" && event.kind === "kick") kickedAt.set(event.target.id, step);
        }
        const justKicked = (rider: RiderSnapshot) => step - (kickedAt.get(rider.id) ?? -Infinity) < 2 * STEPS_PER_SECOND;
        const racing = riders.filter((rider) => rider.id !== PLAYER && rider.status === "racing" && !justKicked(rider));
        for (const a of racing) {
          for (const b of racing) {
            if (a.id < b.id && Math.abs(a.distance - b.distance) < 2 && Math.abs(a.offset - b.offset) < 0.8) overlaps++;
          }
        }
      });

      expect(overlaps, `seed ${seed}`).toBe(0);
    }
  });

  it("have a pace of their own: the same riders are the fastest and the slowest whatever their start order", WHOLE_RACES, () => {
    const { track } = createRace({ seed: 1 });
    /** Each opponent's average speed from their place on the grid to the finish line, fastest first. */
    const fastestFirst = (seed: number) => {
      const grid = createRace({ seed }).snapshot().riders;
      return raceWithoutThePlayer(seed, 300)
        .finished.map(({ rider, time }) => ({ rider, speed: (track.finishDistance - grid[rider].distance) / time }))
        .sort((a, b) => b.speed - a.speed)
        .map(({ rider }) => rider);
    };

    const orders = [1, 2, 3].map(fastestFirst);

    expect(new Set(orders.map((order) => order[0])).size).toBe(1);
    expect(new Set(orders.map((order) => order[13])).size).toBe(1);
  });

  it("are the same fourteen riders in every race, whatever their start order", () => {
    const other = createRace({ seed: 99 }).snapshot().riders;

    expect(other.map(({ id, name, temperament }) => ({ id, name, temperament }))).toEqual(
      riders.map(({ id, name, temperament }) => ({ id, name, temperament })),
    );
  });
});

describe("bumping", () => {
  it("bumps riders apart who run into each other at a small speed difference, instead of riding through", () => {
    const race = startedRace(1);
    const grid = race.snapshot().riders.filter((rider) => rider.id !== PLAYER);
    const target = grid.reduce((nearest, rider) => (rider.distance < nearest.distance ? rider : nearest)).id;
    const input = chase(race, target, 4);
    const gaps: { along: number; across: number; speedDifference: number }[] = [];

    secondsUntil(race, input, () => {
      const { riders } = race.snapshot();
      // While they both stay on their bikes: bumped onto the shoulder, either of them may run into an obstacle there.
      if (riders[target].crash || riders[PLAYER].crash) return true;
      const along = Math.abs(riders[target].distance - riders[PLAYER].distance);
      const across = Math.abs(riders[target].offset - riders[PLAYER].offset);
      if (along < 4 || gaps.length > 0) gaps.push({ along, across, speedDifference: riders[PLAYER].speed - riders[target].speed });
      return gaps.length >= 3 * STEPS_PER_SECOND;
    });

    const touching = gaps.findIndex(({ along, across }) => along < 2.1 && across < 0.9);
    expect(touching, "the player never reached the opponent").toBeGreaterThanOrEqual(0);
    expect(Math.abs(gaps[touching].speedDifference)).toBeLessThan(8);
    // They never ride through each other...
    for (const { along, across } of gaps) expect(along >= 1.9 || across >= 0.7).toBe(true);
    // ...and the bump pushes them apart sideways.
    expect(Math.max(...gaps.slice(touching, touching + 20).map(({ across }) => across))).toBeGreaterThan(gaps[touching].across + 0.3);
    expect(race.snapshot().riders.every((rider) => rider.status === "racing")).toBe(true);
  });
});

/**
 * Input that keeps the player about `gap` metres behind the opponent `target`,
 * a lane to the side of it, so the opponent always has the player close by:
 * it holds its line through the bends and slows for them, and steers round
 * any obstacle in its way.
 */
function shadow(race: Race, target: number, gap = 15) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const { riders } = race.snapshot();
    const me = riders[PLAYER];
    const them = riders[target];
    const sideways = (me.offset - lastOffset) * STEPS_PER_SECOND;
    lastOffset = me.offset;
    let lane = them.offset > 0 ? them.offset - 3 : them.offset + 3;
    // Round any obstacle in its way.
    for (const obstacle of race.track.obstacles) {
      const ahead = obstacle.distance - me.distance;
      const clearance = obstacle.radius + 1.2;
      if (ahead > 0 && ahead < 60 && Math.abs(obstacle.offset - lane) < clearance) {
        lane = obstacle.offset + (lane >= obstacle.offset ? clearance : -clearance);
      }
    }
    const wanted = Math.min(bendSpeed(race), Math.max(0, them.speed + 0.5 * (them.distance - me.distance - gap)));
    return {
      ...NO_INPUT,
      steer: steerTowards(race, lane, sideways),
      throttle: me.speed < wanted ? 1 : 0,
      brake: me.speed > wanted + 1 ? Math.min(1, (me.speed - wanted) / 4) : 0,
    };
  };
}

/**
 * Seconds the opponent `rider` takes to ride from `from` to `to` (distances
 * along the track), while the player rides with the input `makeInput` gives,
 * on a closed road.
 */
function stretchTime(seed: number, rider: number, from: number, to: number, makeInput: (race: Race) => () => PlayerInput) {
  const race = startedRace(seed, CLOSED_ROAD);
  const input = makeInput(race);
  const reached = (distance: number) => {
    secondsUntil(race, input, () => race.snapshot().riders[rider].distance >= distance);
    return race.snapshot().clock;
  };
  const start = reached(from);
  return reached(to) - start;
}

// Catch-up is measured on racers: brawlers and bullies near the player ride up alongside them to fight instead. And on a
// closed road: traffic only fills the road around the player, so it would hold up an opponent near the player and not
// one far from them.
describe("catch-up", () => {
  it("slows opponents far ahead of the player by up to 8%", WHOLE_RACES, () => {
    const seed = 1;
    const target = startOrder(seed).filter((id) => createRace({ seed }).snapshot().riders[id].temperament === "racer").at(-1) ?? PLAYER;
    const { startDistance } = createRace({ seed }).track;
    const [from, to] = [startDistance + 1500, startDistance + 3000];

    const withThePlayerClose = stretchTime(seed, target, from, to, (race) => shadow(race, target));
    const farAheadOfThePlayer = stretchTime(seed, target, from, to, () => () => NO_INPUT);

    // Traffic around the racer (riders to get past, fights nearby) takes some of the full 8% out of the stretch time.
    const slowdown = 1 - withThePlayerClose / farAheadOfThePlayer;
    expect(slowdown).toBeGreaterThan(0.025);
    expect(slowdown).toBeLessThanOrEqual(0.081);
  });

  it("speeds up opponents far behind the player by up to 8%", WHOLE_RACES, () => {
    const seed = 1;
    // Find the longest stretch a racer rides more than 300 m behind the player, who rides well.
    const race = startedRace(seed, CLOSED_ROAD);
    const pilot = autopilot(race);
    const behind = new Map<number, { from: number; to: number }>();
    secondsUntil(race, pilot, () => {
      const { riders } = race.snapshot();
      for (const rider of riders) {
        if (rider.temperament !== "racer" || riders[PLAYER].distance - rider.distance <= 300) continue;
        const stretch = behind.get(rider.id);
        behind.set(rider.id, { from: stretch?.from ?? rider.distance, to: rider.distance });
      }
      return riders[PLAYER].status !== "racing";
    });
    const [rider, { from, to }] = [...behind].reduce((longest, entry) =>
      entry[1].to - entry[1].from > longest[1].to - longest[1].from ? entry : longest,
    );
    expect(to - from).toBeGreaterThan(300);

    const farBehindThePlayer = stretchTime(seed, rider, from, to, (race) => autopilot(race));
    const withThePlayerClose = stretchTime(seed, rider, from, to, (race) => shadow(race, rider));

    const speedUp = withThePlayerClose / farBehindThePlayer - 1;
    expect(speedUp).toBeGreaterThan(0.03);
    expect(speedUp).toBeLessThanOrEqual(0.081);
  });
});

describe("the results", () => {
  it("qualify a player who finishes third or better, and only them", WHOLE_RACES, () => {
    // On a closed road, where how fast the player rides alone decides their position, with no cops, who would bust a
    // player knocked off near one.
    const results = [Infinity, 52, 45].map(
      (targetSpeed) => rideToTheResults(1, (race) => autopilot(race, { targetSpeed }), { ...CLOSED_ROAD, ...NO_COPS }).results,
    );

    for (const { outcome, position, qualified } of results) {
      expect(outcome).toBe("finished");
      expect(qualified).toBe(position !== null && position <= 3);
    }
    expect(results.map(({ qualified }) => qualified)).toContain(true);
    expect(results.map(({ qualified }) => qualified)).toContain(false);
  });

  it("list every rider by name, position and time once the rest of the field is raced to the finish", WHOLE_RACES, () => {
    // With no cops, who would bust the riders who crash near the player.
    const { results, events } = rideToTheResults(1, (race) => autopilot(race), NO_COPS);
    const names = createRace({ seed: 1 }).snapshot().riders.map((rider) => rider.name);

    expect(results.standings.map((standing) => standing.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(new Set(results.standings.map((standing) => standing.rider)).size).toBe(15);
    for (const standing of results.standings) {
      expect(standing.status).toBe("finished");
      expect(standing.name).toBe(names[standing.rider]);
    }
    const times = results.standings.map((standing) => standing.time ?? Infinity);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The standings are the finishes as they happened, the player's among them.
    const finishes = events.filter((event): event is RiderFinished => event.type === "rider-finished");
    expect(results.standings.map(({ rider, position, time }) => ({ rider, position, time }))).toEqual(
      finishes.map(({ rider, position, time }) => ({ rider, position, time })),
    );
    expect(results.standings.find((standing) => standing.rider === PLAYER)).toMatchObject({
      name: "You",
      position: results.position,
      time: results.time,
    });
  });
});

describe("determinism with a full field", () => {
  const record = (seed: number) => {
    const { race, results, events } = rideToTheResults(seed, (race) => autopilot(race));
    return { results, events, final: race.snapshot() };
  };

  it("replays the whole field, its events and its results identically from the same seed and inputs", WHOLE_RACES, () => {
    const first = record(7);
    const second = record(7);

    expect(second).toEqual(first);
    expect(first.final.riders).toHaveLength(15);
    // The whole field raced to the end, though in traffic a rider may be wrecked on the way.
    expect(first.final.riders.filter((rider) => rider.status === "racing")).toEqual([]);
  });

  it("races differently from a different seed", WHOLE_RACES, () => {
    expect(record(8).results.standings).not.toEqual(record(7).results.standings);
  });
});

describe("positions", () => {
  it("change as the player passes riders, climbing from last place", () => {
    // On a closed road, so that the player rides through the field at their own pace.
    const race = startedRace(1, CLOSED_ROAD);
    const pilot = autopilot(race);
    const positions = [player(race).position];
    let outOfOrder = 0;

    secondsUntil(race, pilot, () => {
      const { riders } = race.snapshot();
      positions.push(riders[PLAYER].position);
      // Riders further along the track are ahead of riders behind them.
      const racing = riders.filter((rider) => rider.status === "racing");
      for (const a of racing) {
        for (const b of racing) {
          if (a.distance > b.distance && (a.position ?? Infinity) >= (b.position ?? Infinity)) outOfOrder++;
        }
      }
      return race.snapshot().clock >= 90;
    });

    expect(outOfOrder).toBe(0);
    expect(positions[0]).toBe(15);
    expect(Math.min(...(positions as number[]))).toBeLessThanOrEqual(10);
    const passes = positions.filter((position, index) => index > 0 && position !== null && position < (positions[index - 1] ?? 0));
    expect(passes.length).toBeGreaterThanOrEqual(5);
  });
});
