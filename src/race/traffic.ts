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

/** Traffic is about one car per this many metres of road in each direction... */
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

/** The cars on the road around the player. */
export interface Traffic {
  /** Every car on the road, in the order they came onto it. */
  readonly cars: readonly Car[];
  /** Moves every car on by a step. */
  step(): void;
}

/**
 * Traffic on `track`: cars in the race direction in the two right lanes, and
 * oncoming cars in the two left lanes, about one car per 120 m in each
 * direction from `from` to `to` (distances along the track). Cars in the race
 * direction keep clear of the road before `clearUntil`, where the riders line
 * up. Every choice comes from `random`.
 */
export function createTraffic(track: Track, random: Random, from: number, to: number, clearUntil: number): Traffic {
  const cars: Car[] = [];
  let nextId = 0;
  const lanes = (oncoming: boolean) => {
    const near = track.laneWidth / 2;
    const far = (track.laneWidth * 3) / 2;
    return oncoming ? [-near, -far] : [near, far];
  };

  const addCar = (oncoming: boolean, distance: number) => {
    let pick = random.next();
    const { kind, length, width } = KINDS.find(({ share }) => (pick -= share) < 0) ?? KINDS[0];
    const [slowest, fastest] = oncoming ? ONCOMING_SPEEDS : RACE_DIRECTION_SPEEDS;
    const lane = lanes(oncoming)[random.next() < 0.5 ? 0 : 1];
    cars.push({ id: nextId++, kind, oncoming, length, width, distance, offset: lane, speed: random.between(slowest, fastest) });
  };

  for (const oncoming of [false, true]) {
    const nearest = oncoming ? from : Math.max(from, clearUntil);
    for (let d = to - random.between(0, MEAN_GAP); d >= nearest; d -= random.between(MEAN_GAP - GAP_SPREAD, MEAN_GAP + GAP_SPREAD)) {
      addCar(oncoming, d);
    }
  }

  return {
    cars,
    step() {
      for (const car of cars) car.distance += (car.oncoming ? -car.speed : car.speed) * STEP_SECONDS;
    },
  };
}
