import { describe, expect, it } from "vitest";
import {
  createRace,
  NO_INPUT,
  PLAYER,
  STEP_SECONDS,
  type CarSnapshot,
  type PlayerInput,
  type Race,
  type RaceEvent,
  type Track,
  type TrackPosition,
} from ".";
import {
  autopilot,
  carsAndObstacles,
  CLOSED_ROAD,
  eventsDuring,
  eventsUntil,
  FULL_THROTTLE,
  leftOnTheirOwn,
  NO_COPS,
  player,
  playerCrashed,
  rideInto,
  secondsUntil,
  setUpRace,
  startedRace,
  steerOnto,
  steerTowards,
  STEPS_PER_SECOND,
  WHOLE_RACES,
} from "./test-helpers";

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
  const race = leftOnTheirOwn(seed);
  const pilot = autopilot(race);
  const close = () => {
    const car = carAhead(race);
    return car !== undefined && car.distance - player(race).distance < 150;
  };
  secondsUntil(race, pilot, close, 120);
  return { race, car: carAhead(race)?.id ?? -1 };
}

/**
 * A started race with no cops, ridden with the autopilot until a car going
 * the riders' way stands still in the road 20 to 200 m ahead of the player,
 * as cars do short of the fallen rock near 4 km while they can't change
 * lanes; returns the car's id. The first of `seeds` in which one does.
 */
function behindAStoppedCar(seeds = [10, 16, 7]) {
  for (const seed of seeds) {
    const race = startedRace(seed, NO_COPS);
    const pilot = autopilot(race);
    let stopped: CarSnapshot | undefined;
    const standingAhead = () => {
      const me = player(race);
      stopped = race.snapshot().traffic.find((car) => {
        const ahead = car.distance - me.distance;
        return !car.oncoming && car.speed === 0 && ahead > 20 && ahead < 200;
      });
      return stopped !== undefined || me.distance > race.track.finishDistance - 300;
    };
    secondsUntil(race, pilot, standingAhead, 300);
    race.drainEvents();
    if (stopped) return { race, car: stopped.id, pilot };
  }
  throw new Error(`no car stood still ahead of the player in seeds ${seeds.join(", ")}`);
}

/**
 * A started race with no cops in which the player, riding with the
 * autopilot, has come up to a car going their way that stands still in the
 * road, as cars do short of the fallen rock near 4 km while they can't change
 * lanes, and has run into the middle of its back at about 15 m/s while it
 * still stood there; returns the car's id. The first of `seeds` in which
 * that happens.
 */
function rearEndedAStoppedCar(seeds = [10, 16, 14]) {
  for (const seed of seeds) {
    let found;
    try {
      found = behindAStoppedCar([seed]);
    } catch {
      continue;
    }
    const { race, car, pilot } = found;
    eventsUntil(race, rideIntoTheBackOf(race, car, 15, pilot), playerCrashed, 60);
    if (carOf(race, car)?.speed === 0) return { race, car };
  }
  throw new Error(`the player ran into no car standing still in seeds ${seeds.join(", ")}`);
}

/**
 * Input that rides with `pilot` to within 60 m of the car `id`, then into the
 * middle of its back at about `speed` m/s, holding its line against the bends.
 */
function rideIntoTheBackOf(race: Race, id: number, speed: number, pilot: () => PlayerInput) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const me = player(race);
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    const car = carOf(race, id);
    if (!car || car.distance - me.distance > 60) return pilot();
    return {
      ...NO_INPUT,
      steer: steerTowards(race, car.offset, sideways),
      throttle: me.speed < speed ? 1 : 0,
      brake: me.speed > speed + 1 ? Math.min(1, (me.speed - speed) / 4) : 0,
    };
  };
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
  it("drives in the race direction in the right lanes at 15 to 25 m/s, and oncoming in the left lanes at 18 to 28 m/s", WHOLE_RACES, () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const { roadHalfWidth } = race.track;
    const seen = { oncoming: 0, raceDirection: 0 };
    /** The fastest each car in the race direction drove. */
    const fastest = new Map<number, number>();
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
          // It may slow down behind a slower rider, but never drives faster than its own speed.
          fastest.set(car.id, Math.max(fastest.get(car.id) ?? 0, moved));
          expect(moved).toBeLessThanOrEqual(25 + 1e-9);
          expect(car.speed).toBeCloseTo(moved, 6);
        }
      }
      before = after;
    }

    expect(seen.oncoming).toBeGreaterThan(1000);
    expect(seen.raceDirection).toBeGreaterThan(1000);
    for (const speed of fastest.values()) expect(speed).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(player(race).distance).toBeGreaterThan(race.track.startDistance + 1000);
  });

  it("fills a window around the player, from 150 m behind them to 600 m ahead, with about one car per 120 m in each direction", WHOLE_RACES, () => {
    // With no cops, who would bust the player if they crashed in traffic, ending their ride through it; and on a seed
    // the player rides without a crash, since cars in the race direction come onto the road only while the player is
    // catching them up.
    const race = startedRace(5, NO_COPS);
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

  it("keeps both directions busy around a player who rides slowly or stands still: cars going their way come up from behind", WHOLE_RACES, () => {
    const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length;
    for (const targetSpeed of [12, 0]) {
      // Under way first, then slowly, or standing still, for two minutes.
      const race = startedRace(1, NO_COPS);
      secondsUntil(race, autopilot(race), () => player(race).distance > race.track.startDistance + 1000, 60);
      const riding = autopilot(race, { targetSpeed });
      const counts = { oncoming: [] as number[], raceDirection: [] as number[] };
      for (let step = 0; step < 120 * STEPS_PER_SECOND; step++) {
        race.step(riding());
        const { traffic } = race.snapshot();
        if (step % STEPS_PER_SECOND === 0 && step >= 30 * STEPS_PER_SECOND) {
          counts.oncoming.push(traffic.filter((car) => car.oncoming).length);
          counts.raceDirection.push(traffic.filter((car) => !car.oncoming).length);
        }
      }
      // 750 m of road at one car per 120 m: about six cars in each direction.
      expect(mean(counts.oncoming), `at ${targetSpeed} m/s`).toBeGreaterThan(4.5);
      expect(mean(counts.raceDirection), `at ${targetSpeed} m/s`).toBeGreaterThan(4.5);
    }
  });

  it("brings no car on behind the riders while they wait for the start, so that none comes up through the grid as they set off", () => {
    for (let seed = 1; seed <= 12; seed++) {
      // The player waits out the countdown on the start line, then sets off at full throttle straight ahead.
      const race = createRace({ seed });
      let closest = Infinity;
      for (let step = 0; step < 11 * STEPS_PER_SECOND; step++) {
        race.step(step < 3 * STEPS_PER_SECOND ? NO_INPUT : FULL_THROTTLE);
        const me = player(race);
        for (const car of race.snapshot().traffic) {
          if (!car.oncoming && car.distance < me.distance + car.length) closest = Math.min(closest, me.distance - car.distance);
        }
      }

      // No car going their way comes up from behind within 20 m of them.
      expect(closest, `seed ${seed}`).toBeGreaterThan(20);
    }
  });

  it("queues behind a car stopped ahead of it in its lane, rather than running into it", () => {
    // The player stops in a lane going their way and stands there, so that the cars coming up behind them queue up.
    const race = startedRace(5, NO_COPS);
    secondsUntil(race, autopilot(race, { lane: 1.5 }), () => player(race).distance > race.track.startDistance + 1000, 60);
    const inEachOther: string[] = [];
    let queued = 0;
    eventsDuring(race, 90, () => {
      const { traffic, clock } = race.snapshot();
      const stopped = traffic.filter((car) => !car.oncoming && car.speed < 0.5 && car.distance < player(race).distance);
      queued = Math.max(queued, stopped.length);
      for (const car of traffic) {
        for (const other of traffic) {
          if (other.id <= car.id || other.oncoming !== car.oncoming) continue;
          const along = Math.abs(car.distance - other.distance) < (car.length + other.length) / 2;
          if (along && Math.abs(car.offset - other.offset) < (car.width + other.width) / 2) inEachOther.push(`${clock.toFixed(1)} s: cars ${car.id} and ${other.id}`);
        }
      }
      const me = player(race);
      return me.speed > 0 ? { ...NO_INPUT, brake: 1, steer: Math.max(-1, Math.min(1, 1.5 - me.offset)) } : { ...NO_INPUT, brake: 1 };
    });

    expect(queued).toBeGreaterThanOrEqual(2);
    expect([...new Set(inEachOther.map((entry) => entry.split(": ")[1]))]).toEqual([]);
  });

  it("pulls out round a rider standing still behind it while it waits short of the fallen rock, rather than wait for good", WHOLE_RACES, () => {
    // The player comes up behind a car waiting short of the fallen rock near 4 km and stops just behind its back, a
    // little to its right, in the other lane, the one it is waiting for room in.
    const { race, car } = behindAStoppedCar();
    let lastOffset = player(race).offset;
    const stopBehindIt = (): PlayerInput => {
      const me = player(race);
      const sideways = (me.offset - lastOffset) / STEP_SECONDS;
      lastOffset = me.offset;
      const them = carOf(race, car);
      if (!them) return { ...NO_INPUT, brake: 1 };
      const room = them.distance - them.length / 2 - 2 - me.distance;
      return steerOnto(me, them.offset + 1.25, Math.min(15, Math.sqrt(2 * 4 * Math.max(0, room))), sideways);
    };
    secondsUntil(race, stopBehindIt, () => player(race).speed < 0.1 && carOf(race, car)?.speed === 0, 60);
    const them = carOf(race, car);
    const me = player(race);
    expect(them).toBeDefined();
    expect((them?.distance ?? NaN) - (them?.length ?? NaN) / 2 - me.distance).toBeGreaterThan(1);
    expect(Math.abs(me.offset - (them?.offset ?? NaN))).toBeLessThan(2);

    const waited = secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => (carOf(race, car)?.speed ?? Infinity) > 1, 60);

    expect(waited).toBeLessThan(20);
  });

  it("stays off a closed road", () => {
    const race = startedRace(1, CLOSED_ROAD);
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

  it("throws a rider who runs into the back of it down behind it, not through it, and drives on without running them down", () => {
    const { race, car } = behindACar();
    eventsUntil(race, chaseCar(race, car, 12), playerCrashed);
    /** When the rider, tumbling or on foot, was inside the car they ran into, and when it knocked them down. */
    const inside: number[] = [];
    const knockedDownByIt: number[] = [];

    // The rider stands still once on their feet, while the car drives on.
    for (let step = 0; step < 4 * STEPS_PER_SECOND; step++) {
      race.step({ ...NO_INPUT, brake: 1 });
      const me = player(race);
      const them = carOf(race, car);
      if (!them) continue;
      const along = Math.abs(them.distance - me.distance);
      const across = Math.abs(them.offset - me.offset);
      // A rider on the ground takes up about 0.6 m either way.
      if (along < them.length / 2 + 0.3 && across < them.width / 2 + 0.3) inside.push(race.snapshot().clock);
      const knockedDown = race.drainEvents().some((event) => event.type === "knocked-down" && event.rider === PLAYER);
      if (knockedDown && along < them.length) knockedDownByIt.push(race.snapshot().clock);
    }

    expect(player(race).crash).not.toBeNull();
    expect(inside).toEqual([]);
    expect(knockedDownByIt).toEqual([]);
  });

  it("throws a rider who runs into the back of it standing still down behind it, not through it, and never knocks them down", WHOLE_RACES, () => {
    const { race, car } = rearEndedAStoppedCar();
    const crashedAt = race.snapshot().clock;
    expect(player(race).crash).toBe("tumbling");
    /** When the rider, tumbling or on foot, was inside the car they ran into, and when they were knocked down. */
    const inside: number[] = [];
    const knockedDown: number[] = [];

    // The rider runs straight back to their bike, while the car stands where it is.
    secondsUntil(
      race,
      NO_INPUT,
      () => {
        const me = player(race);
        const them = carOf(race, car);
        const { clock } = race.snapshot();
        // A rider on the ground takes up about 0.6 m either way.
        if (them && Math.abs(them.distance - me.distance) < them.length / 2 + 0.3 && Math.abs(them.offset - me.offset) < them.width / 2 + 0.3) {
          inside.push(clock);
        }
        if (race.drainEvents().some((event) => event.type === "knocked-down" && event.rider === PLAYER)) knockedDown.push(clock);
        return me.crash === null;
      },
      10,
    );

    expect(inside).toEqual([]);
    expect(knockedDown).toEqual([]);
    // Back on their bike as after any slow crash: a tumble, then a few steps back to it.
    expect(race.snapshot().clock - crashedAt).toBeLessThan(2.5);
  });

  it("slows down behind a slower rider on their bike in its lane, rather than running into them from behind", () => {
    const { race, car } = behindACar();
    // The player gets 40 m ahead of the car, pulls into its lane and stops there.
    const pilot = autopilot(race);
    secondsUntil(race, pilot, () => player(race).distance - (carOf(race, car)?.distance ?? Infinity) > 40, 60);
    const stopping = (): PlayerInput => {
      const me = player(race);
      const them = carOf(race, car);
      const steer = them ? Math.max(-1, Math.min(1, 1.5 * (them.offset - me.offset))) : 0;
      return { ...NO_INPUT, steer, brake: 1 };
    };

    const events = eventsDuring(race, 15, stopping).filter(playerCrashed);

    expect(events).toEqual([]);
    const them = carOf(race, car);
    expect(them?.speed).toBeLessThan(1);
    expect(player(race).distance - (them?.distance ?? Infinity)).toBeGreaterThan(0);
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

/**
 * A started race in which the player has crashed into the back of a car,
 * got to their feet and run across the road into the nearer oncoming lane,
 * where they stand still, on foot (the first of `seeds` in which they get
 * there without passing close enough to their bike to get back on it); and
 * the input that keeps them standing there.
 */
function standingInTheOncomingLane(seeds = [1, 4, 2, 3]) {
  for (const seed of seeds) {
    const { race, car } = behindACar(seed);
    eventsUntil(race, chaseCar(race, car, 12), playerCrashed);
    secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => player(race).crash === "on-foot", 3);
    const standing = standIn(race, () => -race.track.laneWidth / 2);
    secondsUntil(race, standing, () => player(race).crash !== "on-foot" || standing().brake === 1, 10);
    if (player(race).crash === "on-foot") return { race, standing };
  }
  throw new Error(`the player never stood in the oncoming lane on foot in seeds ${seeds.join(", ")}`);
}

/**
 * Input for the player on foot: runs towards where `where` says, as nearly as
 * they can, since they can turn their run no more than 60° either way from
 * heading straight for their bike.
 */
function runTowards(race: Race, where: () => TrackPosition) {
  return (): PlayerInput => {
    const me = player(race);
    const { distance, offset } = where();
    const toTheBike = Math.atan2(me.bike.offset - me.offset, me.bike.distance - me.distance);
    const turn = Math.atan2(offset - me.offset, distance - me.distance) - toTheBike;
    // Steering turns the run by up to 60°, more to the right the more it steers to the right when the bike is ahead.
    return { ...NO_INPUT, steer: Math.max(-1, Math.min(1, Math.atan2(Math.sin(turn), Math.cos(turn)) / (Math.PI / 3))) };
  };
}

/** The first roadside sign at least 100 m ahead of the player's start line. */
function firstSign(track: Track) {
  const sign = track.obstacles.find((obstacle) => obstacle.kind === "sign" && obstacle.distance > track.startDistance + 100);
  if (!sign) throw new Error("no sign near the start");
  return sign;
}

/**
 * A started race with no cops, on a road closed to every car but one pulled
 * over onto the shoulder 5 m past the first roadside sign at least 100 m
 * ahead of the player's start line, in which the field has ridden off and the
 * player has ridden into the sign at about 15 m/s: their bike stops against
 * it, and they are thrown on past it and the car. Returns the car.
 */
function thrownPastAParkedCar() {
  const { track } = setUpRace({ seed: 1 }, CLOSED_ROAD);
  const sign = firstSign(track);
  const race = leftOnTheirOwn(1, { ...NO_COPS, traffic: { cars: [{ distance: sign.distance + 5, offset: track.roadHalfWidth + 1.5 }] } });
  eventsUntil(race, rideInto(race, sign, 15), playerCrashed, 60);
  const [car] = race.snapshot().traffic;
  return { race, car };
}

/**
 * A started race with no cops, on a road closed to every car but one coming
 * down the shoulder towards the riders at `speed` m/s, in which the field has
 * ridden off and the player has ridden into the first roadside sign at least
 * 100 m ahead of their start line at about 15 m/s and been thrown on past it,
 * into the car's path: they are on their feet, their bike behind them by the
 * sign, and the car is still on its way, some seconds off. Returns the car, as
 * it is now.
 */
function thrownIntoTheWayOfACar(speed: number) {
  const { track } = setUpRace({ seed: 1 }, CLOSED_ROAD);
  const sign = firstSign(track);
  const coming = { distance: sign.distance + 20 + 75 * speed, offset: track.roadHalfWidth + 1.5, speed, oncoming: true };
  const race = leftOnTheirOwn(1, { ...NO_COPS, traffic: { cars: [coming] } });
  eventsUntil(race, rideInto(race, sign, 15), playerCrashed, 60);
  secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => player(race).crash === "on-foot", 3);
  const car = () => race.snapshot().traffic[0];
  expect(car().distance - car().length / 2 - player(race).distance).toBeGreaterThan(20);
  expect(Math.abs(car().offset - player(race).offset)).toBeLessThan(car().width / 2);
  return { race, car };
}

/**
 * Steps with `input` for `seconds`, the player on foot near the car `car`
 * gives, and returns when they touched it and were inside it, and when they
 * were knocked down.
 */
function onFootBeside(race: Race, car: () => CarSnapshot, input: () => PlayerInput, seconds: number) {
  const touching: number[] = [];
  const inside: number[] = [];
  const knockedDown: number[] = [];
  for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
    race.step(input());
    const me = player(race);
    const them = car();
    const { clock } = race.snapshot();
    if (race.drainEvents().some((event) => event.type === "knocked-down")) knockedDown.push(clock);
    // A rider on foot takes up about 0.6 m either way.
    const along = Math.abs(them.distance - me.distance) - them.length / 2 - 0.3;
    const across = Math.abs(them.offset - me.offset) - them.width / 2 - 0.3;
    if (along < 0.05 && across < 0.05) touching.push(clock);
    if (along < -0.02 && across < -0.02) inside.push(clock);
  }
  return { touching, inside, knockedDown };
}

describe("a rider on foot", () => {
  it("is pushed clear of a car standing still that they run into on the way back to their bike, never knocked down by it", () => {
    const { race, car } = thrownPastAParkedCar();
    /** When the rider on foot touched the car and was inside it, when they were knocked down, and when they got to their feet. */
    const touching: number[] = [];
    const inside: number[] = [];
    const knockedDown: number[] = [];
    let onTheirFeet = Infinity;

    // The rider tumbles to a stop past the car, then runs straight back to their bike behind it.
    secondsUntil(
      race,
      NO_INPUT,
      () => {
        const me = player(race);
        const { clock } = race.snapshot();
        if (race.drainEvents().some((event) => event.type === "knocked-down")) knockedDown.push(clock);
        if (me.crash !== "on-foot") return me.crash === null;
        onTheirFeet = Math.min(onTheirFeet, clock);
        // A rider on foot takes up about 0.6 m either way.
        const along = Math.abs(car.distance - me.distance) - car.length / 2 - 0.3;
        const across = Math.abs(car.offset - me.offset) - car.width / 2 - 0.3;
        if (along < 0.05 && across < 0.05) touching.push(clock);
        if (along < -0.02 && across < -0.02) inside.push(clock);
        return false;
      },
      10,
    );

    expect(touching.length).toBeGreaterThan(0);
    expect(knockedDown).toEqual([]);
    expect(inside).toEqual([]);
    // Round it and back on their bike about as soon as with nothing in the way: 9 m or so at a run.
    expect(race.snapshot().clock - onTheirFeet).toBeLessThan(2.5);
    expect(race.snapshot().traffic).toEqual([car]);
  });

  it("is pushed clear of a car that has gone half past them when they run into its side, never knocked down by it", () => {
    const { race, car } = thrownIntoTheWayOfACar(12);
    // They step aside, out of its path, and wait there until its middle has gone past them (it comes down the road).
    const aside = standIn(race, () => car().offset - car().width / 2 - 0.5);
    secondsUntil(race, aside, () => car().distance < player(race).distance, 30);

    // Then they run across into its side, behind its middle, until it has gone by.
    const intoItsSide = runTowards(race, () => ({ distance: player(race).distance, offset: car().offset }));
    const { touching, inside, knockedDown } = onFootBeside(race, car, intoItsSide, 1);

    expect(touching.length).toBeGreaterThan(0);
    expect(knockedDown).toEqual([]);
    expect(inside).toEqual([]);
    expect(player(race).crash).toBe("on-foot");
  });

  it("is pushed clear of a car going slower than them that they run after, never knocked down by it", () => {
    const { race, car } = thrownIntoTheWayOfACar(3);
    // They step aside, out of its path, and wait there until it has gone by them (it comes down the road)...
    const aside = standIn(race, () => car().offset - car().width / 2 - 0.5);
    secondsUntil(race, aside, () => car().distance + car().length / 2 < player(race).distance, 60);

    // ...then run after it, at its back, faster than it.
    const afterIt = runTowards(race, () => ({ distance: car().distance + car().length / 2, offset: car().offset }));
    const { touching, inside, knockedDown } = onFootBeside(race, car, afterIt, 1.5);

    expect(touching.length).toBeGreaterThan(0);
    expect(knockedDown).toEqual([]);
    expect(inside).toEqual([]);
  });

  it("is pushed clear of a car going slower than them that they brush, running away from it, never knocked down by it", () => {
    const { race, car } = thrownIntoTheWayOfACar(3);
    // They step aside, out of its path, and wait there until its front, but not its middle, has gone by them...
    const aside = standIn(race, () => car().offset - car().width / 2 - 0.5);
    secondsUntil(race, aside, () => car().distance - car().length / 2 < player(race).distance - 0.5, 60);
    expect(car().distance).toBeGreaterThan(player(race).distance);

    // ...then run on down the road, faster than it, cutting in front of it.
    const awayFromIt = runTowards(race, () => ({ distance: car().distance - car().length / 2 - 20, offset: car().offset }));
    const { touching, inside, knockedDown } = onFootBeside(race, car, awayFromIt, 1.5);

    expect(touching.length).toBeGreaterThan(0);
    expect(knockedDown).toEqual([]);
    expect(inside).toEqual([]);
  });

  it("is knocked down by a car that drives into them, however slowly: one at 3 m/s, standing in front of it", () => {
    const { race } = thrownIntoTheWayOfACar(3);

    const events = eventsUntil(race, { ...NO_INPUT, brake: 1 }, (event) => event.type === "knocked-down", 60);

    expect(events.filter((event) => event.type === "knocked-down")).toEqual([
      { type: "knocked-down", rider: PLAYER, impactSpeed: expect.closeTo(3, 1) },
    ]);
  });

  it("is knocked down by a car that runs into them: they tumble again, at no cost to their bike", () => {
    const { race, standing } = standingInTheOncomingLane();
    const condition = player(race).condition;
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
    expect(player(race)).toMatchObject({ crash: "knocked-down", condition, status: "racing" });
    // They tumble for as long as after a crash, then they are on foot again.
    const tumbling = secondsUntil(race, { ...NO_INPUT, brake: 1 }, () => player(race).crash !== "knocked-down", 3);
    expect(tumbling).toBeGreaterThan(1.1);
    expect(tumbling).toBeLessThan(1.3);
    expect(player(race).crash).toBe("on-foot");
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
  // Six races with the player riding at the pack's pace, so that the opponents meet the traffic, which drives around the
  // player; with no cops, who would bust the player if they crashed in traffic, ending their ride through it.
  const races = [1, 2, 3, 4, 5, 6];
  /** Cars and obstacles that came into an opponent's path and that it got past on its bike. */
  let gotPast = 0;
  /** Crashes of opponents into cars and obstacles. */
  let crashedInto = 0;
  /** Every car that came onto the road, and the cars among them that came on right in front of a rider in its lane. */
  let newCars = 0;
  const inFrontOfARider: string[] = [];
  /** Every lane change, and those that moved a car over into the path of a rider in the lane it moved into. */
  let laneChanges = 0;
  const intoARider: string[] = [];
  /** Cars that drove into a fallen rock on the road, and the steps cars spent driving past one. */
  const throughARock: string[] = [];
  let pastARock = 0;
  for (const seed of races) {
    const race = startedRace(seed, NO_COPS);
    const pilot = autopilot(race, { targetSpeed: 48 });
    const { laneWidth } = race.track;
    const fallenRocks = race.track.obstacles.filter((obstacle) => obstacle.kind === "fallen-rock");
    /** Every car seen so far, and its offset in the last snapshot. */
    const lastOffsets = new Map(race.snapshot().traffic.map((car) => [car.id, car.offset]));
    /** Every car and obstacle an opponent is coming up to with it in its path, by "rider: thing". */
    const comingUp = new Set<string>();
    for (let step = 0; step < 240 * STEPS_PER_SECOND && player(race).status === "racing"; step++) {
      race.step(pilot());
      for (const event of race.drainEvents()) {
        if (event.type !== "crash" || event.rider === PLAYER) continue;
        if (event.cause === "traffic" || event.cause === "obstacle") crashedInto++;
        for (const key of comingUp) if (key.startsWith(`${event.rider}:`)) comingUp.delete(key);
      }
      const { riders, clock, traffic } = race.snapshot();
      const onTheirBikes = riders.filter((rider) => rider.status === "racing" && rider.crash === null);
      /** Riders on their bikes in the lane whose middle is at `lane`. */
      const inTheLane = (lane: number) => onTheirBikes.filter((rider) => Math.abs(rider.offset - lane) < laneWidth / 2);
      for (const car of traffic) {
        for (const rock of fallenRocks) {
          const along = Math.abs(rock.distance - car.distance);
          if (along < car.length / 2 + 10) pastARock++;
          if (along < car.length / 2 + rock.radius && Math.abs(rock.offset - car.offset) < car.width / 2 + rock.radius) {
            throughARock.push(`seed ${seed} at ${clock.toFixed(1)} s: car ${car.id}`);
          }
        }
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
      const things = carsAndObstacles(race.track, race.snapshot().traffic);
      for (const rider of riders) {
        if (rider.id === PLAYER || rider.status !== "racing" || rider.crash !== null) continue;
        for (const thing of things) {
          const ahead = thing.distance - rider.distance;
          // Nothing far ahead or well behind is coming up, or being got past, just now.
          if (ahead >= 60 || ahead < -thing.halfLength - 5) continue;
          const key = `${rider.id}: ${thing.key}`;
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

  describe("the cars", () => {
    it("come onto the road out of the riders' way: never right in front of a rider in their lane", () => {
      expect(newCars).toBeGreaterThan(300);
      expect(inFrontOfARider).toEqual([]);
    });

    it("change lanes out of the riders' way: never into the path of a rider close by in the lane they move into", () => {
      expect(laneChanges).toBeGreaterThan(30);
      expect(intoARider).toEqual([]);
    });

    it("keep clear of the fallen rocks on the road: none drives into one", () => {
      expect(pastARock).toBeGreaterThan(100);
      expect([...new Set(throughARock)]).toEqual([]);
    });
  });

  describe("the opponents", () => {
    it("steer around the cars and obstacles in their way", () => {
      expect(gotPast).toBeGreaterThan(400);
    });

    // They can still crash into one (a car with no way round it, a kick into one), but so seldom that six races may
    // see none.
    it("rarely crash into one: no more than once a race among the whole field", () => {
      expect(crashedInto).toBeLessThanOrEqual(races.length);
    });
  });
});
