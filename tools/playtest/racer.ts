import { NO_INPUT, PLAYER, type CarSnapshot, type CopSnapshot, type PlayerInput, type RaceSnapshot, type RiderId, type RiderSnapshot, type Track } from "@/race";
import { clamp, type Bot } from "./bot";
import { footprintOfObstacle, maxSidewaysSpeed, safeSpeedAt, TUNING, type BendLimits } from "./race-rules";

/**
 * The racer: a player who rides fast and clean and never attacks. It gives whole presses of the throttle, the brake
 * and the steering, as a keyboard does.
 *
 * It rides at its pace, a share of a safe one: the speed at which, braking at 10 m/s² for the bends ahead, a grip of
 * 0.9 holds its line through each of them. On a straight it keeps 1.5 m right of the centreline, and cuts in towards
 * the inside of the bend ahead. It gets round riders, cops, cars and obstacles: every step it tries lines across the
 * road, 0.25 m apart, keeps the one that stays clear longest nearest the line it wants, and slows for whatever it can
 * only follow.
 */
export function makeRacer(track: Track, pace: number, fighting?: Fighting): Bot {
  const obstacles = track.obstacles.map(footprintOfObstacle);
  /** As far out as it rides: 0.6 m inside the road's edge. */
  const edge = track.roadHalfWidth - 0.6;
  /** The steering it wants but hasn't pressed yet, carried from step to step. */
  let steerAcc = 0;
  let steps = 0;
  /** The line it chose last step, which it keeps to unless another is clearly better. */
  let lastLine: number | null = null;

  /** How far to steer, from -1 to 1, to head for `line` against the bend's push. */
  function steerFor(me: RiderSnapshot, line: number) {
    const v = me.bike.speed;
    const push = -TUNING.curvePush * v * v * track.sampleAt(me.distance).curvature;
    const sideways = clamp(3 * (line - me.offset), -6, 6);
    const reach = maxSidewaysSpeed(v);
    return reach > 0.2 ? clamp((sideways - push) / reach, -1, 1) : 0;
  }

  /** The keys for riding `line` at `wanted`: a steering held part of the time is pressed for that share of the steps. */
  function keysFor(me: RiderSnapshot, line: number, wanted: number, punch: boolean, kick: boolean): PlayerInput {
    const v = me.bike.speed;
    const steering = steerFor(me, line);
    const throttle = v < wanted - 0.2 ? 1 : 0;
    const brake = v > wanted + 0.8 ? 1 : 0;
    steerAcc += steering;
    const steer = clamp(Math.round(steerAcc), -1, 1);
    steerAcc -= steer;
    return { throttle, brake, steer, punch, kick };
  }

  function decide(prev: RaceSnapshot, cur: RaceSnapshot): PlayerInput {
    steps++;
    const me = cur.riders[PLAYER];
    // Off the bike, it runs straight back to it.
    if (me.status !== "racing" || cur.countdown > 0 || me.crash) return NO_INPUT;
    const v = me.bike.speed;
    const d = me.distance;
    // Cutting in towards the inside of the bend 0.7 s ahead: 120 m per unit of curvature, up to 2 m.
    const kAhead = track.sampleAt(d + v * 0.7).curvature;
    const racingLine = clamp(LANE + clamp(kAhead * 120, -2, 2), 0.6, edge);
    let wanted = pace * safeSpeedAt(track, d + v * 0.3, LIMITS);
    const riders = cur.riders.filter((x) => x.id !== PLAYER && x.status === "racing" && !x.crash);
    const cops = cur.cops.filter((c) => c.status === "riding");

    let line = racingLine;
    let punch = false;
    let kick = false;
    let fightingWith: RiderId | null = null;
    if (fighting) ({ line, wanted, punch, kick, fightingWith } = fighting.plan({ steps, cur, me, riders, cops, line, wanted, edge }));

    // Get round the riders, cops, cars and obstacles nearby: try lines across the road and keep the one that stays
    // clear longest, nearest the line wanted.
    const seen: Seen[] = [];
    for (const x of riders) if (x.id !== fightingWith) seen.push(bikeSeen(x));
    for (const c of cops) seen.push(bikeSeen(c));
    const before = new Map(prev.traffic.map((c) => [c.id, c.offset]));
    for (const car of cur.traffic) {
      const was = before.get(car.id);
      // Changing lanes: how fast it moves across (m/s), and the middle of the lane it is moving to.
      const side = was === undefined ? 0 : (car.offset - was) * 60;
      let target = car.offset;
      if (Math.abs(side) > 0.2) {
        const lanes = car.oncoming ? [-1.5, -4.5] : [1.5, 4.5];
        target = side > 0 ? Math.max(...lanes) : Math.min(...lanes);
      }
      seen.push({ ...carSeen(car), side: Math.abs(side) > 0.2 ? Math.sign(side) * 1.8 : 0, target });
    }
    for (const o of obstacles) {
      if (o.distance - d < 250 && d - o.distance < 10) seen.push({ ...o, rider: false, side: 0, target: o.offset });
    }
    const nearby = seen.filter((t) => t.distance - d < 330 && d - t.distance < 40);
    const k = track.sampleAt(d).curvature;
    const push = -TUNING.curvePush * v * v * k;
    const reach = maxSidewaysSpeed(v);
    const prevMe = prev.riders[PLAYER];
    /** How fast it is moving across the road (m/s). */
    const myLat = !prevMe.crash ? (me.offset - prevMe.offset) * 60 : 0;

    /** On line `y`: how soon something coming at it would hit it there, and how slow it must go for what it can only follow. */
    const assess = (y: number) => {
      const dir = Math.sign(y - me.offset);
      /** How fast it can move across towards `y`, with the bend's push or against it. */
      const lat = Math.max(0.3, 0.8 * (reach + dir * push));
      let headOn = Infinity;
      let need = Infinity;
      for (const t of nearby) {
        const margin = (t.rider ? RIDER_MARGIN : 0.3) + Math.min(0.5, (Math.abs(push) / Math.max(1, reach)) * 0.6);
        const along = t.halfLength + 1 + (t.rider ? 0.2 : 0.6);
        for (let time = 0; time <= LOOK_AHEAD_SECONDS; time += LOOK_STEP_SECONDS) {
          const gap = t.distance - d + (t.velocity - v) * time;
          if (Math.abs(gap) >= along) continue;
          // The bike carries on sideways as it is going for a moment, then heads for the line.
          const drift = myLat * Math.min(time, 0.12);
          const moved = Math.min(Math.abs(y - me.offset - drift), lat * Math.max(0, time - 0.12));
          const at = me.offset + drift + Math.sign(y - me.offset - drift) * moved;
          let theirs = t.offset;
          if (t.side) theirs = t.side > 0 ? Math.min(t.target, t.offset + t.side * time) : Math.max(t.target, t.offset + t.side * time);
          if (Math.abs(at - theirs) >= t.halfWidth + 0.4 + (time > 0.3 ? margin : 0.2)) continue;
          if (t.velocity < 0) headOn = Math.min(headOn, time);
          else if (t.distance > d) {
            const room = Math.max(0, t.distance - d - along);
            need = Math.min(need, t.velocity + Math.sqrt(2 * 10 * room));
          } else if (!t.rider) headOn = Math.min(headOn, time + 0.5);
          break;
        }
      }
      return { headOn, need };
    };

    const wantedLine = clamp(line, -edge, edge);
    const candidates = [wantedLine, me.offset];
    for (let y = -edge; y <= edge + 1e-9; y += 0.25) candidates.push(y);
    if (lastLine !== null) candidates.push(clamp(lastLine, -edge, edge));
    let best: { y: number; cost: number; headOn: number; need: number } | null = null;
    for (const y of candidates) {
      const { headOn, need } = assess(y);
      const speedLoss = Math.max(0, wanted - need);
      let cost = (headOn < LOOK_AHEAD_SECONDS ? 2000 + (LOOK_AHEAD_SECONDS - headOn) * 300 : 0) + speedLoss * 2 + Math.abs(y - wantedLine) * 1.5 + Math.abs(y - me.offset) * 0.4;
      if (y < 0 && fightingWith === null) cost += 3;
      if (lastLine !== null && Math.abs(y - lastLine) < 0.3) cost -= 3;
      if (!best || cost < best.cost) best = { y, cost, headOn, need };
    }
    if (best) {
      line = best.y;
      wanted = Math.min(wanted, best.need);
      if (best.headOn < LOOK_AHEAD_SECONDS) wanted = Math.min(wanted, v - 4);
    }
    lastLine = line;
    return keysFor(me, line, Math.max(0, wanted), punch, kick);
  }

  return {
    decide,
    hear() {},
    // It never attacks: the brawler's counts, all 0, so that every racer's and brawler's log row has the same `bot`.
    stats: () => fighting?.stats() ?? { punches: 0, kicks: 0, swings: 0, stealTries: 0, fights: 0 },
  };
}

/**
 * What a bot that fights adds to the racer's riding (the brawler, brawler.ts): each step, given the line and speed
 * the racer wants, where to ride and how fast instead, whether to punch or kick, and the rider it is fighting, whom
 * it rides up to rather than round.
 */
export interface Fighting {
  plan(situation: Situation): Plan;
  stats(): Readonly<Record<string, number>>;
}

export interface Situation {
  /** Steps the bot has been asked for its input, the countdown's too. */
  readonly steps: number;
  readonly cur: RaceSnapshot;
  /** The player, racing on their bike. */
  readonly me: RiderSnapshot;
  /** The opponents racing on their bikes. */
  readonly riders: readonly RiderSnapshot[];
  /** The cops riding in the race. */
  readonly cops: readonly CopSnapshot[];
  readonly line: number;
  readonly wanted: number;
  /** As far out as the bot rides. */
  readonly edge: number;
}

export interface Plan {
  readonly line: number;
  readonly wanted: number;
  readonly punch: boolean;
  readonly kick: boolean;
  readonly fightingWith: RiderId | null;
}

/** The bot's limits for a safe pace: the bike's top speed, a grip of 0.9 through the bends, and braking at 10 m/s² for them. */
const LIMITS: BendLimits = { topSpeed: TUNING.topSpeed, grip: 0.9, braking: 10 };
/** Metres right of the centreline it rides on a straight. */
const LANE = 1.5;
/** How much room (m) it leaves round another bike, beyond the 0.4 m it always does; 0.3 m round a car or an obstacle. */
export const RIDER_MARGIN = 0.15;
/** How far ahead it looks along a line, a step of 0.05 s at a time. */
const LOOK_AHEAD_SECONDS = 4;
const LOOK_STEP_SECONDS = 0.05;

/** A bike, car or obstacle on the road that the racer keeps clear of: its footprint, and what it is. */
interface Seen {
  readonly distance: number;
  readonly offset: number;
  /** Metres per second along the track: negative for an oncoming car. */
  readonly velocity: number;
  readonly halfLength: number;
  readonly halfWidth: number;
  /** A rider's or a cop's bike. */
  readonly rider: boolean;
  /** A car changing lanes: how fast it moves across (m/s, 0 for none), and the middle of the lane it is moving to. */
  readonly side: number;
  readonly target: number;
}

/** A rider's or a cop's bike, as the racer sees it. */
function bikeSeen({ bike }: RiderSnapshot | CopSnapshot): Seen {
  return { distance: bike.distance, offset: bike.offset, velocity: bike.speed, halfLength: 1, halfWidth: 0.4, rider: true, side: 0, target: bike.offset };
}

/** A car, as the racer sees it: its footprint as the race's `footprintOfCar` gives it, from what the snapshot shows. */
function carSeen(car: CarSnapshot) {
  return { distance: car.distance, offset: car.offset, velocity: car.oncoming ? -car.speed : car.speed, halfLength: car.length / 2, halfWidth: car.width / 2, rider: false };
}
