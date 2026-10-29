import type { Random } from "./random";
import { STEP_SECONDS } from "./steps";
import type { Track } from "./track";

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
const BEHIND = 150;
/** ...to this many metres ahead of them... */
const AHEAD = 600;
/** ...at about one car per this many metres of road in each direction... */
const MEAN_GAP = 120;
/** ...each car this many metres, give or take, from the one in front of it in its direction. */
const GAP_SPREAD = 60;

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
}

/** Where the player is, which the traffic gathers around. */
export interface Around {
  /** Metres along the centreline. */
  readonly distance: number;
  /** Metres per second along the track. */
  readonly speed: number;
}

/** The cars on the road around the player. */
export interface Traffic {
  /** Every car on the road, in the order they came onto it. */
  readonly cars: readonly Car[];
  /**
   * Moves every car on by a step, then lets the cars that have left the
   * window around the player go and brings new ones in at its far end.
   */
  step(player: Around): void;
}

/** A car about to come onto the road, chosen ahead of time so that waiting for room never changes the choice. */
interface NextCar {
  readonly kind: (typeof KINDS)[number];
  readonly lane: 0 | 1;
  readonly speed: number;
  /** Metres it keeps behind the car in front of it in its direction when it comes onto the road. */
  readonly gap: number;
}

/**
 * Traffic on `track` around the player: cars in the race direction in the two
 * right lanes and oncoming cars in the two left lanes, about one car per 120 m
 * in each direction from 150 m behind the player to 600 m ahead. New cars
 * come onto the road only at the far end of that window, as in the original
 * game: oncoming cars whenever there is room, and cars in the race direction
 * when the player is catching them up. At the start (the player at
 * `player.distance`), cars in the race direction keep clear of the road
 * before `clearUntil`, where the riders line up. Every choice comes from
 * `random`.
 */
export function createTraffic(track: Track, random: Random, player: Around, clearUntil: number): Traffic {
  const cars: Car[] = [];
  let nextId = 0;
  const lanes = (oncoming: boolean) => {
    const near = track.laneWidth / 2;
    const far = (track.laneWidth * 3) / 2;
    return oncoming ? [-near, -far] : [near, far];
  };
  const chooseNext = (oncoming: boolean): NextCar => {
    let pick = random.next();
    const kind = KINDS.find(({ share }) => (pick -= share) < 0) ?? KINDS[0];
    const [slowest, fastest] = oncoming ? ONCOMING_SPEEDS : RACE_DIRECTION_SPEEDS;
    return {
      kind,
      lane: random.next() < 0.5 ? 0 : 1,
      speed: random.between(slowest, fastest),
      gap: random.between(MEAN_GAP - GAP_SPREAD, MEAN_GAP + GAP_SPREAD),
    };
  };
  const next = { raceDirection: chooseNext(false), oncoming: chooseNext(true) };

  /** Brings the next car in a direction onto the road at `distance`. */
  const bringOn = (oncoming: boolean, distance: number) => {
    const { kind, lane, speed } = oncoming ? next.oncoming : next.raceDirection;
    const { length, width } = kind;
    cars.push({ id: nextId++, kind: kind.kind, oncoming, length, width, distance, offset: lanes(oncoming)[lane], speed });
    if (oncoming) next.oncoming = chooseNext(true);
    else next.raceDirection = chooseNext(false);
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
    while (distance >= nearest) {
      bringOn(oncoming, distance);
      distance -= (oncoming ? next.oncoming : next.raceDirection).gap;
    }
  }

  return {
    cars,
    step(player) {
      for (const car of cars) car.distance += (car.oncoming ? -car.speed : car.speed) * STEP_SECONDS;

      const { back, front } = windowAround(player.distance);
      for (let i = cars.length - 1; i >= 0; i--) {
        if (cars[i].distance < back || cars[i].distance > front) cars.splice(i, 1);
      }

      for (const oncoming of [false, true]) {
        const { gap, speed } = oncoming ? next.oncoming : next.raceDirection;
        // A car in the race direction comes into the window only if the player is catching it up, and never at the road's end.
        if (!oncoming && (speed >= player.speed || player.distance + AHEAD >= track.length)) continue;
        let furthest = -Infinity;
        for (const car of cars) if (car.oncoming === oncoming) furthest = Math.max(furthest, car.distance);
        if (front - furthest >= gap) bringOn(oncoming, front);
      }
    },
  };
}
