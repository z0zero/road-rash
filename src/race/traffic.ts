import type { Random } from "./random";
import { BIKE_LENGTH, BIKE_WIDTH, clamp } from "./riding";
import { STEP_SECONDS } from "./steps";
import type { Moving, Track, TrackPosition } from "./track";

/** The body a car is built on, which sets its size. */
export type CarKind = "hatchback" | "saloon" | "van" | "pickup";

/** Each kind of car's length and width (metres), and how common it is. */
const KINDS: readonly { readonly kind: CarKind; readonly length: number; readonly width: number; readonly share: number }[] = [
  { kind: "hatchback", length: 3.9, width: 1.75, share: 0.35 },
  { kind: "saloon", length: 4.6, width: 1.8, share: 0.35 },
  { kind: "van", length: 5, width: 2, share: 0.15 },
  { kind: "pickup", length: 5.3, width: 1.95, share: 0.15 },
];

/** Cars in the race direction drive at 15 to 25 m/s, oncoming cars at 18 to 28 m/s. */
const RACE_DIRECTION_SPEEDS = [15, 25] as const;
const ONCOMING_SPEEDS = [18, 28] as const;

/** Traffic fills the road from this many metres behind the player... */
export const BEHIND = 150;
/** ...to this many metres ahead of them, where cars come onto the road and leave it... */
export const AHEAD = 600;
/** ...at about one car per this many metres of road in each direction... */
const MEAN_GAP = 120;
/** ...each car this many metres, give or take, from the one in front of it in its direction. */
const GAP_SPREAD = 60;
/**
 * A car comes onto the road in a lane, or changes into one, only where no
 * rider in that lane is nearer to it than this along the road (metres)...
 */
const RIDERS_ROOM = 30;
/** ...or would come up to it, or it to them, within this many seconds. */
const RIDERS_SECONDS = 3;

/**
 * The road never holds more than this many cars at once, both ways together:
 * the window around the player holds about a dozen, and at most about 17
 * once the cars bunch up, so this leaves them plenty of room.
 */
export const MOST_CARS = 32;

/** Some cars change lanes now and then: this share of them... */
const LANE_CHANGERS = 0.35;
/** ...each first after this many seconds on the road... */
const FIRST_LANE_CHANGE = [2, 8] as const;
/** ...and then every so many seconds, whenever there is room... */
const LANE_CHANGE_EVERY = [4, 10] as const;
/** ...moving across at this many metres per second. */
const LANE_CHANGE_SPEED = 1.8;
/** A lane has room for a car to change into it when no car in it is nearer than this along the road (metres), and the riders give it room. */
const LANE_CHANGE_ROOM = 30;
/** A rider or cop on a bike going slower than this (m/s) is standing still. */
const STANDING_STILL = 0.5;

/** A car changes lanes to get round a fallen rock in its lane once it is this many metres from it, if there is room... */
const ROCK_SIGHT = 150;
/** ...and otherwise stops this many metres short of it until there is. */
const ROCK_STOP = 3;

/** A car keeps this many metres, plus a second's driving, behind the car ahead of it in its lane... */
const FOLLOWING_GAP = 8;
const FOLLOWING_SECONDS = 1;
/** ...braking at up to this many m/s² to keep its distance, and pulling away again at up to this many. */
export const CAR_BRAKING = 6;
const ACCELERATION = 2;

/** A car on the road: someone driving by who isn't racing. */
export interface Car {
  /** No two cars in a race share one. */
  readonly id: number;
  readonly kind: CarKind;
  /** Whether it drives towards the riders, in the left lanes. */
  readonly oncoming: boolean;
  /** Metres. */
  readonly length: number;
  readonly width: number;
  /** Metres along the centreline: the middle of the car. */
  distance: number;
  /** Metres right of the centreline. */
  offset: number;
  /** Metres per second in its own direction of travel. */
  speed: number;
  /** The speed it drives at with the road ahead clear. */
  readonly cruise: number;
  /** The offset of the middle of the lane it keeps to, or is changing to. */
  lane: number;
  /** Steps until it next changes lanes; Infinity for a car that keeps to its lane. */
  laneChangeIn: number;
}

/** Where the player is, which the traffic gathers around. */
export interface Around {
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres per second along the track. */
  readonly speed: number;
}

/** Where a rider, or a cop, is on the road, which cars make room for. */
export interface RiderOrCopOnTheRoad extends Moving {
  /** Whether they are on their bike: a car slows behind a rider on their bike, but runs down one on foot. */
  readonly onTheirBike: boolean;
}

/** The cars on the road around the player. */
export interface Traffic {
  /** Every car on the road, in the order they came onto it. */
  readonly cars: readonly Car[];
  /**
   * Moves every car on by a step, then lets the cars that have left the
   * window around the player go and brings new ones in at its ends. Cars
   * come onto the road, and change lanes, out of the way of the `riders` and
   * cops, and slow down behind a slower one on their bike. While the riders are
   * `waitingForTheStart`, none comes on behind the player, where it would
   * come up through the start grid as they set off.
   */
  step(player: Around, riders: readonly RiderOrCopOnTheRoad[], waitingForTheStart?: boolean): void;
}

/** A closed road: no traffic at all. */
export const CLOSED_ROAD: Traffic = { cars: [], step() {} };

/** A car a test puts on the road: where it is, and how it drives on. */
export interface TestCar extends TrackPosition {
  /** Metres per second in its own direction of travel, which it keeps whatever is in its way: 0, standing still, unless given. */
  readonly speed?: number;
  /** Whether it drives towards the riders, against the race direction. */
  readonly oncoming?: boolean;
}

/**
 * Saloons where a test puts them (`placed`), on a road closed to every other
 * car: each stands still, or drives on at a steady speed in its own
 * direction, keeping to its offset, whatever is in its way.
 */
export function testCars(placed: readonly TestCar[]): Traffic {
  const { kind, length, width } = KINDS.find((each) => each.kind === "saloon") ?? KINDS[0];
  const cars: Car[] = placed.map(({ distance, offset, speed = 0, oncoming = false }, id) => ({
    id,
    kind,
    oncoming,
    length,
    width,
    distance,
    offset,
    speed,
    cruise: speed,
    lane: offset,
    laneChangeIn: Infinity,
  }));
  return {
    cars,
    step() {
      for (const car of cars) car.distance += velocityOf(car) * STEP_SECONDS;
    },
  };
}

/** A car's speed along the track (m/s): negative for an oncoming car. */
export function velocityOf(car: Car): number {
  return car.oncoming ? -car.speed : car.speed;
}

/** A car about to come onto the road, chosen ahead of time so that waiting for room never changes the choice. */
interface NextCar {
  readonly kind: (typeof KINDS)[number];
  readonly lane: 0 | 1;
  readonly speed: number;
  /** Steps until it first changes lanes, or Infinity. */
  readonly laneChangeIn: number;
  /** Metres it keeps behind the car in front of it in its direction when it comes onto the road. */
  readonly gap: number;
}

/**
 * Traffic on `track` around the player: cars in the race direction in the two
 * right lanes and oncoming cars in the two left lanes, about one car per 120 m
 * in each direction from 150 m behind the player to 600 m ahead. New cars
 * come onto the road at the far end of that window, as in the original
 * game: oncoming cars whenever there is room, and cars in the race direction
 * when the player is catching them up; cars in the race direction that the
 * player isn't catching up come on at its near end instead, behind them, and
 * catch them up. Never right in front of a rider, though: in the other lane,
 * or later, when a rider is about to ride up to one.
 * Cars keep their distance from the car ahead of them in their lane, and
 * cars in the race direction from a slower rider on their bike ahead of them
 * too. Some change lanes now and then, when no car is close by in the lane they
 * change to and no rider in it is close by or coming up to them. Cars change
 * lanes to get round a fallen rock in theirs, or stop short of it until they
 * can, and never come onto the road just short of one. At the start
 * (the player at `player.distance`), cars in the race direction keep clear of
 * the road before `clearUntil`, where the riders line up. Every choice comes
 * from `random`.
 */
export function createTraffic(track: Track, random: Random, player: Around, clearUntil: number): Traffic {
  const cars: Car[] = [];
  let nextId = 0;
  const lanes = (oncoming: boolean) => {
    const near = track.laneWidth / 2;
    const far = (track.laneWidth * 3) / 2;
    return oncoming ? [-near, -far] : [near, far];
  };
  const stepsBetween = ([shortest, longest]: readonly [number, number]) =>
    Math.round(random.between(shortest, longest) / STEP_SECONDS);
  const chooseNext = (oncoming: boolean): NextCar => {
    let pick = random.next();
    const kind = KINDS.find(({ share }) => (pick -= share) < 0) ?? KINDS[0];
    const [slowest, fastest] = oncoming ? ONCOMING_SPEEDS : RACE_DIRECTION_SPEEDS;
    return {
      kind,
      lane: random.next() < 0.5 ? 0 : 1,
      speed: random.between(slowest, fastest),
      laneChangeIn: random.chance(LANE_CHANGERS) ? stepsBetween(FIRST_LANE_CHANGE) : Infinity,
      gap: random.between(MEAN_GAP - GAP_SPREAD, MEAN_GAP + GAP_SPREAD),
    };
  };
  const next = { raceDirection: chooseNext(false), oncoming: chooseNext(true) };

  /** The offset of the middle of the lane the next car in a direction is to come onto the road in. */
  const laneOfNext = (oncoming: boolean) => lanes(oncoming)[(oncoming ? next.oncoming : next.raceDirection).lane];

  /** Brings the next car in a direction onto the road at `distance`, in the lane at `offset` (its own lane, unless given). */
  const bringOn = (oncoming: boolean, distance: number, offset = laneOfNext(oncoming)) => {
    const { kind, speed, laneChangeIn } = oncoming ? next.oncoming : next.raceDirection;
    cars.push({
      id: nextId++,
      kind: kind.kind,
      oncoming,
      length: kind.length,
      width: kind.width,
      distance,
      offset,
      speed,
      cruise: speed,
      lane: offset,
      laneChangeIn,
    });
    if (oncoming) next.oncoming = chooseNext(true);
    else next.raceDirection = chooseNext(false);
  };

  /**
   * Whether the `riders` give a car `distance` along the track, driving at
   * `velocity` (m/s along the track), room to come into the lane whose middle
   * is at `lane`: no rider in that lane is close to it, or would come up to
   * it, or it to them, within `RIDERS_SECONDS`.
   */
  const ridersGiveRoom = (riders: readonly RiderOrCopOnTheRoad[], distance: number, lane: number, velocity: number) =>
    riders.every((rider) => {
      const ahead = rider.distance - distance;
      const closing = ahead > 0 ? velocity - rider.speed : rider.speed - velocity;
      const near = Math.abs(ahead) < Math.max(RIDERS_ROOM, closing * RIDERS_SECONDS);
      return !near || Math.abs(rider.offset - lane) >= track.laneWidth / 2 + BIKE_WIDTH / 2;
    });

  /** The fallen rocks on the road, which cars drive round. */
  const fallenRocks = track.obstacles.filter((obstacle) => obstacle.kind === "fallen-rock");

  /**
   * The fallen rock a car (or the next car to come onto the road) would drive
   * into, at `distance` along the track and keeping to the offset `offset`,
   * within `ROCK_SIGHT` ahead of it, and how far its front is from the rock's
   * near side (metres); null if none.
   */
  const rockAhead = (car: Pick<Car, "oncoming" | "length" | "width">, distance: number, offset: number) => {
    let nearest: { readonly gap: number } | null = null;
    for (const rock of fallenRocks) {
      const ahead = car.oncoming ? distance - rock.distance : rock.distance - distance;
      const gap = ahead - car.length / 2 - rock.radius;
      const inTheWay = Math.abs(rock.offset - offset) < car.width / 2 + rock.radius;
      if (inTheWay && ahead > -car.length / 2 && gap < ROCK_SIGHT && (!nearest || gap < nearest.gap)) nearest = { gap };
    }
    return nearest;
  };

  /**
   * A car whose time has come, or that has a fallen rock ahead in its lane,
   * moves over to its direction's other lane if there is room in it and no
   * rock ahead there; otherwise it tries again next step.
   */
  const changeLanes = (car: Car, riders: readonly RiderOrCopOnTheRoad[]) => {
    const dodging = rockAhead(car, car.distance, car.lane) !== null;
    if (!dodging && (car.laneChangeIn === Infinity || --car.laneChangeIn > 0)) return;
    const [near, far] = lanes(car.oncoming);
    const other = car.lane === near ? far : near;
    if (rockAhead(car, car.distance, other)) return;
    const carsGiveRoom = cars.every(
      (them) =>
        them === car ||
        them.oncoming !== car.oncoming ||
        Math.abs(them.distance - car.distance) >= LANE_CHANGE_ROOM ||
        Math.abs(them.offset - other) >= (them.width + car.width) / 2,
    );
    // A bike standing still behind it, clear of its back, isn't coming up to it: it can pull out in front of it.
    const behindIt = (rider: RiderOrCopOnTheRoad) => (car.oncoming ? rider.distance - car.distance : car.distance - rider.distance);
    const standingBehind = (rider: RiderOrCopOnTheRoad) =>
      rider.onTheirBike && rider.speed < STANDING_STILL && behindIt(rider) >= (car.length + BIKE_LENGTH) / 2;
    const comingUp = riders.filter((rider) => !standingBehind(rider));
    if (!carsGiveRoom || !ridersGiveRoom(comingUp, car.distance, other, velocityOf(car))) return;
    car.lane = other;
    if (car.laneChangeIn !== Infinity) car.laneChangeIn = stepsBetween(LANE_CHANGE_EVERY);
  };

  /**
   * A car slows to the speed of a car close ahead of it in its lane, and in
   * time for a much slower one further on, so it never runs into it, and so
   * does a car in the race direction for a slower rider on their bike ahead of
   * it (`riders`); it stops short of a fallen rock in its way; otherwise it
   * drives at its own speed.
   */
  const keepDistance = (car: Car, riders: readonly RiderOrCopOnTheRoad[]) => {
    let wanted = car.cruise;
    const rock = rockAhead(car, car.distance, car.offset);
    if (rock) wanted = Math.min(wanted, Math.sqrt(2 * CAR_BRAKING * Math.max(0, rock.gap - ROCK_STOP)));
    for (const rider of car.oncoming ? [] : riders) {
      const gap = rider.distance - car.distance - car.length / 2 - BIKE_LENGTH / 2;
      const inItsLane = Math.abs(rider.offset - car.offset) < (car.width + BIKE_WIDTH) / 2;
      if (!rider.onTheirBike || !inItsLane || gap <= -BIKE_LENGTH || rider.speed >= car.speed) continue;
      wanted = Math.min(wanted, rider.speed + Math.sqrt(2 * CAR_BRAKING * Math.max(0, gap - FOLLOWING_GAP)));
    }
    for (const them of cars) {
      if (them === car || them.oncoming !== car.oncoming) continue;
      const along = car.oncoming ? car.distance - them.distance : them.distance - car.distance;
      const ahead = along - (car.length + them.length) / 2;
      const sideBySide = Math.abs(them.offset - car.offset) < (them.width + car.width) / 2;
      if (!sideBySide || along <= 0) continue;
      if (ahead < FOLLOWING_GAP + car.speed * FOLLOWING_SECONDS) wanted = Math.min(wanted, them.speed);
      // And it slows in time for a much slower car further on, such as one stopped short of a fallen rock.
      wanted = Math.min(wanted, them.speed + Math.sqrt(2 * CAR_BRAKING * Math.max(0, ahead - FOLLOWING_GAP)));
    }
    // It never backs up, even for a cop rolling backwards in front of it: it stops and waits.
    car.speed += clamp(Math.max(0, wanted) - car.speed, -CAR_BRAKING * STEP_SECONDS, ACCELERATION * STEP_SECONDS);
  };

  const windowAround = (distance: number) => ({
    back: Math.max(0, distance - BEHIND),
    front: Math.min(track.length, distance + AHEAD),
  });

  // The road around the start, filled from the far end back.
  const start = windowAround(player.distance);
  for (const oncoming of [false, true]) {
    const nearest = oncoming ? start.back : Math.max(start.back, clearUntil);
    let distance = start.front - random.between(0, MEAN_GAP);
    while (distance >= nearest && cars.length < MOST_CARS) {
      bringOn(oncoming, distance);
      distance -= (oncoming ? next.oncoming : next.raceDirection).gap;
    }
  }

  return {
    cars,
    step(player, riders, waitingForTheStart = false) {
      for (const car of cars) {
        changeLanes(car, riders);
        keepDistance(car, riders);
      }
      for (const car of cars) {
        car.distance += (car.oncoming ? -car.speed : car.speed) * STEP_SECONDS;
        car.offset += clamp(car.lane - car.offset, -LANE_CHANGE_SPEED * STEP_SECONDS, LANE_CHANGE_SPEED * STEP_SECONDS);
      }

      const { back, front } = windowAround(player.distance);
      for (let i = cars.length - 1; i >= 0; i--) {
        if (cars[i].distance < back || cars[i].distance > front) cars.splice(i, 1);
      }

      for (const oncoming of [false, true]) {
        const { gap, speed } = oncoming ? next.oncoming : next.raceDirection;
        // A car in the race direction comes into the window where the player will meet it: at its far end if the player
        // is catching it up, and never at the road's end; otherwise at its near end, behind them, to catch them up.
        const behind = !oncoming && speed >= player.speed;
        if (!oncoming && !behind && player.distance + AHEAD >= track.length) continue;
        if (behind && waitingForTheStart) continue;
        const at = behind ? back : front;
        let nearest = behind ? Infinity : -Infinity;
        for (const car of cars) {
          if (car.oncoming === oncoming) nearest = behind ? Math.min(nearest, car.distance) : Math.max(nearest, car.distance);
        }
        if (Math.abs(at - nearest) < gap || cars.length >= MOST_CARS) continue;
        // Never in front of a rider, or a fallen rock: in its own lane, or else the other, where there is room.
        const velocity = oncoming ? -speed : speed;
        const { kind } = oncoming ? next.oncoming : next.raceDirection;
        const own = laneOfNext(oncoming);
        const offset = [own, ...lanes(oncoming).filter((lane) => lane !== own)].find(
          (lane) => ridersGiveRoom(riders, at, lane, velocity) && !rockAhead({ oncoming, ...kind }, at, lane),
        );
        if (offset !== undefined) bringOn(oncoming, at, offset);
      }
    },
  };
}
