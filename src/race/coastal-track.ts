import { createGroundGrid } from "./ground-grid";
import { placeObstacles, placeScenery } from "./placements";
import { createRandom, type Random } from "./random";
import { buildTrack, type Bend, type Slope, type Track, type TrackLayout } from "./track";

/** The coastal road's own seed: the same road in every race. */
const COASTAL_TRACK_SEED = 0x5ea5_1de;
/** Metres of road behind the start line. */
const RUN_UP = 60;
/** Metres of straight road after the start line. */
const START_STRAIGHT = 420;
/** Metres from the start line to the finish line. */
const RACE_DISTANCE = 7000;
/** The finish line comes at least this many metres after the last bend. */
const FINISH_STRAIGHT = 160;
/** Metres of road beyond the finish line. */
const RUN_OUT = 300;
/** Away from hairpins, the road heads at most this far either side of north (radians). */
const MAX_HEADING = (70 * Math.PI) / 180;
/** Race distances (metres from the start line) around which the hairpin sections come. */
const HAIRPIN_SECTIONS = [1500, 3300, 5100];
/** The road runs north along the coast, with the sea to the west, where the sun sets. */
const SEA_HEADING = -Math.PI / 2;
/** Metres above sea level where the centreline begins. */
const START_ELEVATION = 70;
/** The road stays between these elevations (metres above sea level)... */
const LOWEST = 30;
const HIGHEST = 150;
/** Two stretches of road further apart along the track than this... */
const CLEARANCE_ARC = 150;
/** ...are at least this far apart on the ground (metres). */
const CLEARANCE = 32;

const DEGREES = Math.PI / 180;

let coastalTrack: Track | undefined;

/**
 * The coastal cliff road at sunset. It is the same road in every race, so
 * personal bests compare like with like; the race's own seed drives everything
 * else.
 */
export function getCoastalTrack(): Track {
  coastalTrack ??= generateCoastalTrack(COASTAL_TRACK_SEED);
  return coastalTrack;
}

function generateCoastalTrack(seed: number): Track {
  const random = createRandom(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const road = buildTrack(planLayout(random));
    if (!keepsClearOfItself(road)) continue;
    return {
      ...road,
      scenery: placeScenery(road, createRandom(seed + 1)),
      obstacles: placeObstacles(road, createRandom(seed + 2)),
    };
  }
  throw new Error("Could not lay out a coastal road that keeps clear of itself");
}

/** Bends added at the end of the road so far, and the heading they leave it at. */
class RoadPlan {
  readonly bends: Bend[] = [];
  length = 0;
  heading = 0;

  straight(length: number) {
    this.push({ length, startCurvature: 0, endCurvature: 0 });
  }

  /** Turns through `angle` radians (positive right) on an arc of `radius`, easing in and out. */
  turn(angle: number, radius: number) {
    const curvature = Math.sign(angle) / radius;
    const easing = Math.min(Math.max(radius * 0.3, 18), 60, radius * Math.abs(angle));
    const arc = radius * Math.abs(angle) - easing;
    this.push({ length: easing, startCurvature: 0, endCurvature: curvature });
    if (arc > 0) this.push({ length: arc, startCurvature: curvature, endCurvature: curvature });
    this.push({ length: easing, startCurvature: curvature, endCurvature: 0 });
    this.heading += angle;
  }

  append(other: RoadPlan) {
    for (const bend of other.bends) this.push(bend);
    this.heading += other.heading;
  }

  private push(bend: Bend) {
    if (bend.length <= 0) return;
    this.bends.push(bend);
    this.length += bend.length;
  }
}

function planLayout(random: Random): TrackLayout {
  const road = new RoadPlan();
  road.straight(RUN_UP + START_STRAIGHT);
  const finishDistance = RUN_UP + RACE_DISTANCE;
  const hairpinsAt = HAIRPIN_SECTIONS.map((distance) => RUN_UP + distance + random.between(-150, 150));

  while (true) {
    const dueHairpins = hairpinsAt.length > 0 && road.length >= hairpinsAt[0];
    let feature: RoadPlan | null = null;
    for (let tries = 0; tries < 12 && !feature; tries++) {
      const candidate = dueHairpins ? hairpinSection(road.heading, random) : ordinaryFeature(road.heading, random);
      if (road.length + candidate.length <= finishDistance - FINISH_STRAIGHT) feature = candidate;
    }
    if (!feature) break;
    if (dueHairpins && Math.abs(road.heading) < 25 * DEGREES) hairpinsAt.shift();
    road.append(feature);
  }

  road.straight(finishDistance - road.length + RUN_OUT);
  return {
    bends: road.bends,
    slopes: planSlopes(road.length, random),
    startElevation: START_ELEVATION,
    startDistance: RUN_UP,
    finishDistance,
    seaHeading: SEA_HEADING,
  };
}

/**
 * Hills one after another: climbs that tip over short, blind crests into
 * descents, and valleys between them, staying between LOWEST and HIGHEST.
 */
function planSlopes(length: number, random: Random): Slope[] {
  const slopes: Slope[] = [];
  let covered = 0;
  let grade = 0;
  let elevation = START_ELEVATION;
  const slope = (slopeLength: number, endGrade: number) => {
    slopes.push({ length: slopeLength, startGrade: grade, endGrade });
    elevation += (slopeLength * (grade + endGrade)) / 2;
    covered += slopeLength;
    grade = endGrade;
  };

  slope(RUN_UP + 200, 0);
  let climb = true;
  while (covered < length) {
    let target = random.between(0.045, 0.09);
    if (!climb) target = -target;
    if (elevation > HIGHEST - 30) target = -Math.abs(target);
    if (elevation < LOWEST + 20) target = Math.abs(target);
    const crest = grade > 0 && target < 0;
    slope(crest ? random.between(40, 75) : random.between(70, 140), target);
    const room = target > 0 ? (HIGHEST - elevation) / target : (elevation - LOWEST) / -target;
    slope(Math.max(30, Math.min(random.between(120, 380), room)), target);
    climb = target < 0;
  }
  return slopes;
}

/** A sweeper, a bend, a pair of S-bends or a straight, keeping the road heading roughly north. */
function ordinaryFeature(heading: number, random: Random): RoadPlan {
  const plan = new RoadPlan();
  const roll = random.next();
  if (roll < 0.35) {
    const radius = random.between(200, 450);
    const arcLength = random.between(190, 340);
    plan.turn(fitTurn(heading, Math.min(arcLength / radius, 65 * DEGREES), random), radius);
  } else if (roll < 0.6) {
    plan.turn(fitTurn(heading, random.between(35, 85) * DEGREES, random), random.between(55, 110));
  } else if (roll < 0.8) {
    const first = fitTurn(heading, random.between(30, 60) * DEGREES, random);
    plan.turn(first, random.between(45, 90));
    plan.straight(random.between(15, 40));
    const second = -Math.sign(first) * Math.min(random.between(30, 60) * DEGREES, MAX_HEADING + Math.sign(first) * (heading + first));
    plan.turn(second, random.between(45, 90));
  } else {
    plan.straight(random.between(60, 240));
  }
  return plan;
}

/**
 * A signed turn angle of about `size` radians that keeps the road within
 * MAX_HEADING of north, mostly turning back towards north when it has strayed.
 */
function fitTurn(heading: number, size: number, random: Random) {
  let direction: number = random.sign();
  if (Math.abs(heading) > 30 * DEGREES && random.chance(0.8)) direction = -Math.sign(heading);
  let room = MAX_HEADING - direction * heading;
  if (room < 15 * DEGREES) {
    direction = -direction;
    room = MAX_HEADING - direction * heading;
  }
  return direction * Math.min(size, room);
}

/**
 * Where the road meets a ravine or a steep slope: either it runs inland along
 * a ravine, hairpins round its head and comes back out, or it climbs a slope
 * by a pair of switchback hairpins. Either way it leaves heading as it came.
 */
function hairpinSection(heading: number, random: Random): RoadPlan {
  const plan = new RoadPlan();
  if (Math.abs(heading) >= 25 * DEGREES) {
    // Straighten up first; the hairpins come next time round.
    plan.turn(-heading, random.between(80, 140));
    return plan;
  }
  const leg = random.between(60, 120);
  if (random.chance(0.6)) {
    const cornerRadius = random.between(45, 60);
    plan.turn(90 * DEGREES, cornerRadius);
    plan.straight(leg);
    plan.turn(-180 * DEGREES, random.between(20, 26));
    plan.straight(leg);
    plan.turn(90 * DEGREES, cornerRadius);
  } else {
    const side = random.sign();
    const radius = random.between(20, 26);
    plan.straight(leg + radius + 30);
    plan.turn(side * 180 * DEGREES, radius);
    plan.straight(leg);
    plan.turn(-side * 180 * DEGREES, radius);
    plan.straight(leg + radius + 30);
  }
  return plan;
}

/** Whether stretches of road far apart along the track stay well apart on the ground. */
function keepsClearOfItself(track: Track): boolean {
  const spacing = 4;
  const grid = createGroundGrid<{ x: number; z: number; d: number }>(CLEARANCE);
  for (let d = 0; d <= track.length; d += spacing) {
    const { x, z } = track.sampleAt(d);
    let clear = true;
    grid.forEachNear(x, z, 1, (other) => {
      if (d - other.d > CLEARANCE_ARC && Math.hypot(x - other.x, z - other.z) < CLEARANCE) clear = false;
    });
    if (!clear) return false;
    grid.add(x, z, { x, z, d });
  }
  return true;
}
