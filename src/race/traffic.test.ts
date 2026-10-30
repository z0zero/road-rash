import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type CarSnapshot, type PlayerInput, type Race, type RaceEvent } from ".";
import { autopilot, eventsUntil, NO_COPS, player, secondsUntil, startedRace, stepFor, STEPS_PER_SECOND } from "./test-helpers";

type Crash = Extract<RaceEvent, { type: "crash" }>;
const isCrash = (event: RaceEvent): event is Crash => event.type === "crash";
const playerCrashed = (event: RaceEvent) => isCrash(event) && event.rider === PLAYER;

/** The car with this id, while it is on the road. */
function carOf(race: Race, id: number): CarSnapshot | undefined {
  return race.snapshot().traffic.find((car) => car.id === id);
}

/** The nearest car ahead of the player going their way, if any. */
function carAhead(race: Race): CarSnapshot | undefined {
  const me = player(race);
  return race
    .snapshot()
    .traffic.filter((car) => !car.oncoming && car.distance > me.distance)
    .sort((a, b) => a.distance - b.distance)[0];
}

/**
 * A started race in which the field has ridden off, leaving the player on
 * their own, and the player has ridden up to within 150 m of a car going
 * their way; returns the car's id.
 */
function behindACar(seed = 1) {
  const race = startedRace(seed);
  stepFor(race, 40);
  const pilot = autopilot(race);
  const close = () => {
    const car = carAhead(race);
    return car !== undefined && car.distance - player(race).distance < 150;
  };
  secondsUntil(race, pilot, close, 120);
  return { race, car: carAhead(race)?.id ?? -1 };
}

/** Input that rides up behind the car `id`, steering straight at it, and closes the last 20 m at about `closing` m/s faster than it. */
function chaseCar(race: Race, id: number, closing: number) {
  return (): PlayerInput => {
    const me = player(race);
    const car = carOf(race, id);
    if (!car) return NO_INPUT;
    const wanted = car.speed + closing + 0.3 * Math.max(0, car.distance - me.distance - 20);
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 1.5 * (car.offset - me.offset))),
      throttle: me.speed < wanted ? 1 : 0,
      brake: me.speed > wanted + 0.5 ? Math.min(1, (me.speed - wanted) / 4) : 0,
    };
  };
}

describe("traffic", () => {
  it("drives in the race direction in the right lanes at 15 to 25 m/s, and oncoming in the left lanes at 18 to 28 m/s", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const { roadHalfWidth } = race.track;
    const seen = { oncoming: 0, raceDirection: 0 };
    let before: readonly CarSnapshot[] = race.snapshot().traffic;

    for (let step = 0; step < 60 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const after = race.snapshot().traffic;
      for (const car of after) {
        const was = before.find((other) => other.id === car.id);
        if (!was) continue;
        // Along the track, metres per second in the race direction.
        const moved = (car.distance - was.distance) / STEP_SECONDS;
        if (car.oncoming) {
          seen.oncoming++;
          expect(car.offset + car.width / 2).toBeLessThanOrEqual(0);
          expect(car.offset - car.width / 2).toBeGreaterThanOrEqual(-roadHalfWidth);
          expect(-moved).toBeGreaterThanOrEqual(18 - 1e-9);
          expect(-moved).toBeLessThanOrEqual(28 + 1e-9);
          expect(car.speed).toBeCloseTo(-moved, 6);
        } else {
          seen.raceDirection++;
          expect(car.offset - car.width / 2).toBeGreaterThanOrEqual(0);
          expect(car.offset + car.width / 2).toBeLessThanOrEqual(roadHalfWidth);
          expect(moved).toBeGreaterThanOrEqual(15 - 1e-9);
          expect(moved).toBeLessThanOrEqual(25 + 1e-9);
          expect(car.speed).toBeCloseTo(moved, 6);
        }
      }
      before = after;
    }

    expect(seen.oncoming).toBeGreaterThan(1000);
    expect(seen.raceDirection).toBeGreaterThan(1000);
    expect(player(race).distance).toBeGreaterThan(race.track.startDistance + 1000);
  });

  it("fills a window around the player, from 150 m behind them to 600 m ahead, with about one car per 120 m in each direction", () => {
    // With no cops, who would bust the player if they crashed in traffic, ending their ride through it.
    const race = startedRace(1, NO_COPS);
    const pilot = autopilot(race);
    const counts = { oncoming: [] as number[], raceDirection: [] as number[] };
    const gaps: number[] = [];

    for (let step = 0; step < 150 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const { traffic, riders } = race.snapshot();
      for (const car of traffic) gaps.push(car.distance - riders[PLAYER].distance);
      // Once the player is under way: their own speed brings the cars in the race direction into the window.
      if (step % STEPS_PER_SECOND === 0 && step >= 20 * STEPS_PER_SECOND) {
        counts.oncoming.push(traffic.filter((car) => car.oncoming).length);
        counts.raceDirection.push(traffic.filter((car) => !car.oncoming).length);
      }
    }

    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-150 - 1e-6);
    expect(Math.min(...gaps)).toBeLessThan(-140);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(600 + 1e-6);
    expect(Math.max(...gaps)).toBeGreaterThan(590);
    // 750 m of road at one car per 120 m: about six cars in each direction.
    const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length;
    for (const direction of [counts.oncoming, counts.raceDirection]) {
      expect(mean(direction)).toBeGreaterThan(5);
      expect(mean(direction)).toBeLessThan(7.5);
    }
  });

  it("stays off a closed road", () => {
    const race = startedRace(1, { traffic: false });
    const pilot = autopilot(race);

    for (let step = 0; step < 60 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      expect(race.snapshot().traffic).toEqual([]);
    }
    expect(player(race).distance).toBeGreaterThan(race.track.startDistance + 1000);
  });

  it("keeps to its lanes, though some cars change lanes now and then, and never runs into itself", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const lanes = race.track.laneWidth;
    /** The lanes each car has been seen in: 1 and 2 for the lanes right of the centreline, -1 and -2 for those left of it. */
    const seenIn = new Map<number, Set<number>>();
    let overlaps = 0;

    for (let step = 0; step < 150 * STEPS_PER_SECOND; step++) {
      race.step(pilot());
      const { traffic } = race.snapshot();
      for (const car of traffic) {
        const lane = Math.sign(car.offset) * Math.ceil(Math.abs(car.offset) / lanes);
        // In a lane: its whole width between that lane's lines.
        const inLane = Math.abs(Math.abs(car.offset) - (Math.abs(lane) - 0.5) * lanes) <= (lanes - car.width) / 2;
        if (inLane) seenIn.set(car.id, (seenIn.get(car.id) ?? new Set()).add(lane));
      }
      for (const a of traffic) {
        for (const b of traffic) {
          const touching =
            Math.abs(a.distance - b.distance) < (a.length + b.length) / 2 && Math.abs(a.offset - b.offset) < (a.width + b.width) / 2;
          if (a.id < b.id && touching) overlaps++;
        }
      }
    }

    const changedLanes = [...seenIn.values()].filter((lanesSeen) => lanesSeen.size > 1).length;
    expect(seenIn.size).toBeGreaterThan(40);
    expect(changedLanes).toBeGreaterThanOrEqual(3);
    expect(changedLanes).toBeLessThan(seenIn.size / 2);
    expect(overlaps).toBe(0);
  });
});

describe("running into a car", () => {
  it("crashes a rider who hits it at more than a small speed difference", () => {
    const { race, car } = behindACar();
    const input = chaseCar(race, car, 12);
    let difference = 0;
    const closingIn = () => {
      difference = player(race).speed - (carOf(race, car)?.speed ?? NaN);
      return input();
    };

    const events = eventsUntil(race, closingIn, playerCrashed);

    expect(events.filter(playerCrashed)).toEqual([
      { type: "crash", rider: PLAYER, cause: "traffic", impactSpeed: expect.closeTo(difference, 0) },
    ]);
    expect(difference).toBeGreaterThan(8);
    expect(player(race).crash).toBe("tumbling");
  });

  it("head on, crashes a rider at the two speeds added together", () => {
    const { race } = behindACar();
    const oncoming = race
      .snapshot()
      .traffic.filter((car) => car.oncoming && car.distance - player(race).distance > 60)
      .sort((a, b) => a.distance - b.distance)[0];
    const input = (): PlayerInput => {
      const me = player(race);
      const car = carOf(race, oncoming.id);
      const steer = car ? Math.max(-1, Math.min(1, 1.5 * (car.offset - me.offset))) : 0;
      return { ...NO_INPUT, steer, throttle: me.speed < 30 ? 1 : 0, brake: me.speed > 31 ? 0.5 : 0 };
    };
    let meeting = 0;
    const headingIn = () => {
      meeting = player(race).speed + (carOf(race, oncoming.id)?.speed ?? NaN);
      return input();
    };

    const events = eventsUntil(race, headingIn, playerCrashed, 30);

    expect(events.filter(playerCrashed)).toEqual([
      { type: "crash", rider: PLAYER, cause: "traffic", impactSpeed: expect.closeTo(meeting, 0) },
    ]);
    expect(meeting).toBeGreaterThan(45);
  });

  it("bumps a rider who touches it at a small speed difference: they don't crash, and can't ride through it", () => {
    const { race, car } = behindACar();
    const input = chaseCar(race, car, 4);
    const gaps: { along: number; across: number; difference: number }[] = [];
    const crashes: RaceEvent[] = [];

    secondsUntil(
      race,
      input,
      () => {
        crashes.push(...race.drainEvents().filter(playerCrashed));
        const me = player(race);
        const them = carOf(race, car);
        if (!them) return true;
        // Metres between the bike and the car, along the track and across it: negative where they overlap.
        const along = them.distance - me.distance - (them.length + 2) / 2;
        const across = Math.abs(them.offset - me.offset) - (them.width + 0.8) / 2;
        if (along < 2 || gaps.length > 0) gaps.push({ along, across, difference: me.speed - them.speed });
        return gaps.length >= 4 * STEPS_PER_SECOND;
      },
      60,
    );

    const touching = gaps.findIndex(({ along, across }) => along < 0.1 && across < 0.1);
    expect(touching, "the player never reached the car").toBeGreaterThanOrEqual(0);
    expect(gaps[touching].difference).toBeLessThan(8);
    expect(crashes).toEqual([]);
    // They never ride into the car...
    for (const { along, across } of gaps) expect(along > -0.1 || across > -0.1).toBe(true);
    // ...and stay on their bike.
    expect(player(race)).toMatchObject({ status: "racing", crash: null });
  });
});

/**
 * Input for the player on foot: runs across the road to the offset `where`
 * gives, then stands still there. Steering turns the run left or right of
 * heading straight for the bike; it takes the turn that heads across
 * towards the offset.
 */
function standIn(race: Race, where: () => number) {
  return (): PlayerInput => {
    const me = player(race);
    const across = where() - me.offset;
    if (Math.abs(across) < 0.2) return { ...NO_INPUT, brake: 1 };
    const toTheBike = Math.atan2(me.bike.offset - me.offset, me.bike.distance - me.distance);
    // Turning right (steering +1) heads more to the right when the bike is ahead, more to the left when it is behind.
    return { ...NO_INPUT, steer: Math.sign(across) * (Math.cos(toTheBike) >= 0 ? 1 : -1) };
  };
}

describe("a rider on foot", () => {
  it("is knocked down by a car that runs into them: they tumble again, at no cost to their bike", () => {
    const { race, car } = behindACar();
    eventsUntil(race, chaseCar(race, car, 12), playerCrashed);
    secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => player(race).crash === "on-foot", 3);
    const condition = player(race).condition;
    // The player gets into the nearer oncoming lane and stands still there until a car comes along it.
    const standing = standIn(race, () => -race.track.laneWidth / 2);
    let standingStill = false;
    const waiting = () => {
      const input = standing();
      standingStill = input.brake === 1 && player(race).speed === 0;
      return input;
    };

    const events = eventsUntil(race, waiting, (event) => event.type === "knocked-down", 30);

    const me = player(race);
    const culprit = race.snapshot().traffic.reduce((nearest, other) =>
      Math.abs(other.distance - me.distance) < Math.abs(nearest.distance - me.distance) ? other : nearest,
    );
    expect(standingStill).toBe(true);
    expect(culprit.oncoming).toBe(true);
    expect(events.filter((event) => event.type === "knocked-down")).toEqual([
      { type: "knocked-down", rider: PLAYER, impactSpeed: expect.closeTo(culprit.speed, 6) },
    ]);
    expect(events.filter(playerCrashed)).toEqual([]);
    expect(player(race)).toMatchObject({ crash: "tumbling", condition, status: "racing" });
  });
});

/** Whether a car and a rider are coming together: the one behind is faster than the one in front. Returns the seconds until they meet, or Infinity. */
function secondsUntilTheyMeet(car: CarSnapshot, rider: { readonly distance: number; readonly speed: number }) {
  const velocity = car.oncoming ? -car.speed : car.speed;
  // Metres between the car's end and the middle of the bike, which reaches 1 m beyond it.
  const along = rider.distance - car.distance;
  const gap = Math.abs(along) - car.length / 2 - 1;
  const closing = along > 0 ? velocity - rider.speed : rider.speed - velocity;
  return closing > 0 ? Math.max(0, gap) / closing : Infinity;
}

describe("riding with the pack in traffic", () => {
  // Six races with the player riding at the pack's pace, so that the riders meet the traffic, which drives around the
  // player; with no cops, who would bust the player if they crashed in traffic, ending their ride through it.
  const races = [1, 2, 3, 4, 5, 6];
  /** Every car that came onto the road, and the cars among them that came on right in front of a rider in its lane. */
  let newCars = 0;
  const inFrontOfARider: string[] = [];
  /** Every lane change, and those that moved a car over into the path of a rider in the lane it moved into. */
  let laneChanges = 0;
  const intoARider: string[] = [];
  for (const seed of races) {
    const race = startedRace(seed, NO_COPS);
    const pilot = autopilot(race, { targetSpeed: 48 });
    const { laneWidth } = race.track;
    /** Every car seen so far, and its offset in the last snapshot. */
    const lastOffsets = new Map(race.snapshot().traffic.map((car) => [car.id, car.offset]));
    for (let step = 0; step < 240 * STEPS_PER_SECOND && player(race).status === "racing"; step++) {
      race.step(pilot());
      const { riders, clock, traffic } = race.snapshot();
      const onTheirBikes = riders.filter((rider) => rider.status === "racing" && rider.crash === null);
      /** Riders on their bikes in the lane whose middle is at `lane`. */
      const inTheLane = (lane: number) => onTheirBikes.filter((rider) => Math.abs(rider.offset - lane) < laneWidth / 2);
      for (const car of traffic) {
        const last = lastOffsets.get(car.id);
        lastOffsets.set(car.id, car.offset);
        if (last === undefined) {
          newCars++;
          for (const rider of inTheLane(car.offset)) {
            if (secondsUntilTheyMeet(car, rider) < 1) inFrontOfARider.push(`seed ${seed} at ${clock.toFixed(1)} s: car ${car.id}, ${rider.name}`);
          }
          continue;
        }
        // A car leaving the middle of its lane is changing lanes, to its direction's other lane.
        const middles = [laneWidth / 2, (3 * laneWidth) / 2];
        if (car.offset === last || !middles.includes(Math.abs(last))) continue;
        laneChanges++;
        const lane = Math.sign(last) * (Math.abs(last) === middles[0] ? middles[1] : middles[0]);
        for (const rider of inTheLane(lane)) {
          if (Math.abs(rider.distance - car.distance) < 20 || secondsUntilTheyMeet(car, rider) < 2) {
            intoARider.push(`seed ${seed} at ${clock.toFixed(1)} s: car ${car.id}, ${rider.name}`);
          }
        }
      }
    }
  }

  describe("the cars", () => {
    it("come onto the road out of the riders' way: never right in front of a rider in their lane", () => {
      expect(newCars).toBeGreaterThan(300);
      expect(inFrontOfARider).toEqual([]);
    });

    it("change lanes out of the riders' way: never into the path of a rider close by in the lane they move into", () => {
      expect(laneChanges).toBeGreaterThan(30);
      expect(intoARider).toEqual([]);
    });
  });
});

/** A car or an obstacle, as something on the road a rider can run into: its middle, and half its length and width (metres). */
interface Thing {
  readonly key: string;
  readonly distance: number;
  readonly offset: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

function thingsOn(race: Race): Thing[] {
  return [
    ...race.snapshot().traffic.map((car) => ({
      key: `car ${car.id}`,
      distance: car.distance,
      offset: car.offset,
      halfLength: car.length / 2,
      halfWidth: car.width / 2,
    })),
    ...race.track.obstacles.map((obstacle, index) => ({
      key: `obstacle ${index}`,
      distance: obstacle.distance,
      offset: obstacle.offset,
      halfLength: obstacle.radius,
      halfWidth: obstacle.radius,
    })),
  ];
}

describe("opponents", () => {
  it("steer around the cars and obstacles in their way most of the time, but can still crash into them", () => {
    /** Cars and obstacles that came into an opponent's path and that it got past on its bike. */
    let gotPast = 0;
    let crashedInto = 0;
    for (const seed of [1, 2, 3]) {
      const race = startedRace(seed);
      const pilot = autopilot(race);
      /** Every car and obstacle an opponent is coming up to with it in its path, by "rider: thing". */
      const comingUp = new Set<string>();
      for (let step = 0; step < 240 * STEPS_PER_SECOND && player(race).status === "racing"; step++) {
        race.step(pilot());
        for (const event of race.drainEvents()) {
          if (event.type !== "crash" || event.rider === PLAYER) continue;
          if (event.cause === "traffic" || event.cause === "obstacle") crashedInto++;
          for (const key of comingUp) if (key.startsWith(`${event.rider}:`)) comingUp.delete(key);
        }
        const things = thingsOn(race);
        for (const rider of race.snapshot().riders) {
          if (rider.id === PLAYER || rider.status !== "racing" || rider.crash !== null) continue;
          for (const thing of things) {
            const key = `${rider.id}: ${thing.key}`;
            const ahead = thing.distance - rider.distance;
            const inItsPath = Math.abs(thing.offset - rider.offset) < thing.halfWidth + 0.4;
            if (!comingUp.has(key) && ahead > 20 && ahead < 60 && inItsPath) comingUp.add(key);
            if (comingUp.has(key) && ahead < -thing.halfLength - 1) {
              gotPast++;
              comingUp.delete(key);
            }
          }
        }
      }
    }

    expect(gotPast).toBeGreaterThan(200);
    expect(crashedInto).toBeGreaterThan(0);
    expect(crashedInto / (gotPast + crashedInto)).toBeLessThan(0.05);
  });
});
