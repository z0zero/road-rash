import { describe, expect, it } from "vitest";
import {
  createRace,
  isPlayer,
  NO_INPUT,
  PLAYER,
  type Difficulty,
  type PlayerInput,
  type Race,
  type RaceResults,
  type RaceSnapshot,
  type RiderId,
} from ".";
import {
  alongsideAn,
  attacksOnThePlayer,
  autopilot,
  CLOSED_ROAD,
  eventsUntil,
  nearestOpponent,
  nearestWithinReach,
  NO_COPS,
  player,
  rideInto,
  secondsUntil,
  setUpRace,
  startedRace,
  STEPS_PER_SECOND,
  WHOLE_RACES,
} from "./test-helpers";

/**
 * A running digest (cyrb53, 53 bits) of everything a race hands out, as JSON:
 * two races with the same digest handed out the same snapshots, events and
 * results, byte for byte.
 */
class Digest {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  add(value: unknown) {
    const text = JSON.stringify(value);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      this.h1 = Math.imul(this.h1 ^ code, 2654435761);
      this.h2 = Math.imul(this.h2 ^ code, 1597334677);
    }
  }

  /** The digest so far, as 14 hex digits. */
  value(): string {
    let h1 = Math.imul(this.h1 ^ (this.h1 >>> 16), 2246822507) ^ Math.imul(this.h2 ^ (this.h2 >>> 13), 3266489909);
    const h2 = Math.imul(this.h2 ^ (this.h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    h1 >>>= 0;
    return ((2097151 & h2) * 4294967296 + h1).toString(16).padStart(14, "0");
  }
}

/** How the recorded races' player hits back: whenever a rider is within reach, or only now and then. */
type HitsBack = "always" | "now and then";

/**
 * The recorded races' player, scripted from the race's own snapshots alone, so
 * that the same race replays the same input: they ride the middle of the
 * race-direction lanes at up to 44 m/s, slowing for the bends ahead and
 * behind a rider in their way, and, with a rider within reach, punch every
 * two thirds of a second and kick in between: always, or now and then, in the
 * first 10 s of every 30 s only, letting the opponents' hits go unanswered the
 * rest of the time.
 */
function recordedRider(race: Race, hitsBack: HitsBack) {
  let steps = 0;
  return (): PlayerInput => {
    steps++;
    const { riders } = race.snapshot();
    const me = riders[PLAYER];
    let wanted = 44;
    for (let ahead = 0; ahead <= 160; ahead += 10) {
      const curvature = Math.abs(race.track.sampleAt(me.distance + ahead).curvature);
      wanted = Math.min(wanted, Math.sqrt(12 / Math.max(curvature, 1e-6) + 2 * 7 * ahead));
    }
    let withinReach = false;
    for (const rider of riders) {
      if (rider.id === PLAYER || rider.status !== "racing" || rider.crash) continue;
      const ahead = rider.distance - me.distance;
      const across = Math.abs(rider.offset - me.offset);
      if (ahead > 0 && ahead < 15 && across < 1.2) wanted = Math.min(wanted, rider.speed + 3);
      if (Math.abs(ahead) <= 2 && across <= 1.8) withinReach = true;
    }
    const push = -0.3 * me.speed * me.speed * race.track.sampleAt(me.distance).curvature;
    const reach = Math.max(1, Math.min(1.6 * me.speed, 8));
    const hitting = withinReach && (hitsBack === "always" || steps % (30 * STEPS_PER_SECOND) < 10 * STEPS_PER_SECOND);
    return {
      throttle: me.speed < wanted ? 1 : 0,
      brake: me.speed > wanted + 2 ? 0.6 : 0,
      steer: Math.max(-1, Math.min(1, (2 * (1.5 - me.offset) - push) / reach)),
      punch: hitting && steps % 40 === 0,
      kick: hitting && steps % 40 === 20,
    };
  };
}

/**
 * A snapshot as v1.0.0 handed it out: without what snapshots have said since,
 * whether a rider waits at their bike for a car to go by, which nobody does
 * on a road closed to cars.
 */
function asOnV1(snapshot: RaceSnapshot) {
  return {
    ...snapshot,
    riders: snapshot.riders.map(({ waitingForACar, ...rider }) => {
      expect(waitingForACar).toBe(false);
      return rider;
    }),
  };
}

/**
 * Races `race` with the recorded rider, hitting back as `hitsBack` says, until
 * their race is over, then the rest of the field to the finish, and returns a
 * digest of everything it handed out every ten seconds of race, and of the
 * results.
 */
function digestsOf(race: Race, hitsBack: HitsBack) {
  const input = recordedRider(race, hitsBack);
  const digests: string[] = [];
  let digest = new Digest();
  let steps = 0;
  while (race.snapshot().riders[PLAYER].status === "racing" && steps < 400 * STEPS_PER_SECOND) {
    race.step(input());
    steps++;
    digest.add(asOnV1(race.snapshot()));
    digest.add(race.drainEvents());
    if (steps % (10 * STEPS_PER_SECOND) === 0) {
      digests.push(digest.value());
      digest = new Digest();
    }
  }
  digest.add(race.fastForward());
  digest.add(race.drainEvents());
  digests.push(digest.value());
  return digests;
}

/**
 * Digests of two races recorded with v1.0.0 (seed 6, on a closed road with no
 * cops, so that nothing of the riding fixes since touches them): every ten
 * seconds of race until the player finished, then the rest of the field to
 * the finish and the results. Hitting back always, the player finished 13th
 * in 3:16.61; hitting back now and then, they took 14 hits, the opponents'
 * breathers, patience and attacks on the player deciding what came next, and
 * finished 14th in 3:23.84.
 */
const RECORDED_ON_V1: Record<HitsBack, readonly string[]> = {
  always: [
    "096e873442e970", "0674ba1739cd28", "0c321a01324bae", "0d7ab3f61a6213", "11d64694328d52",
    "044b4f9da3c589", "1d7fe8d767f408", "11d032788c60de", "057d99d2ffba1d", "13c71b820d0957",
    "062593faa48fb0", "15418f0f38be71", "00cd84ee700a27", "0fc952eab6a62d", "03317ae0ae9b1e",
    "06591c0040f4bb", "06842867f2eac2", "1c86cb3a7810c3", "1185dc3c03db05", "17d8bee8238dd9",
  ],
  "now and then": [
    "096e873442e970", "0674ba1739cd28", "0fdf6da19f1def", "10115a5a163858", "173a0aa8ea7b68",
    "194b31b479f12e", "0319f645397b79", "0868114bdd20ea", "1224f548a2da1b", "1ef3894b73bf0e",
    "035eadaf86b60b", "01974a9b106702", "0319363357bc88", "187630717642a1", "048207607490e3",
    "1b4b4027decc31", "08159338611ab7", "17c32d53b9d118", "17028c0f5802b1", "0f564d44ede24d",
    "0e85875df21a0b",
  ],
};

describe("a race on Normal", () => {
  it("replays a race recorded with v1.0.0 byte for byte, whether Normal is asked for or left to the default", WHOLE_RACES, () => {
    expect(digestsOf(setUpRace({ seed: 6, difficulty: "normal" }, { ...CLOSED_ROAD, ...NO_COPS }), "always")).toEqual(RECORDED_ON_V1.always);
    expect(digestsOf(setUpRace({ seed: 6 }, { ...CLOSED_ROAD, ...NO_COPS }), "always")).toEqual(RECORDED_ON_V1.always);
  });

  it("replays byte for byte a race recorded with v1.0.0 in which the player hits back only now and then, so that its breathers, patience and attacks come into play", WHOLE_RACES, () => {
    expect(digestsOf(setUpRace({ seed: 6 }, { ...CLOSED_ROAD, ...NO_COPS }), "now and then")).toEqual(RECORDED_ON_V1["now and then"]);
  });

  it("is the race created when no difficulty is asked for, in traffic and with cops", () => {
    const asked = createRace({ seed: 7, difficulty: "normal" });
    const left = createRace({ seed: 7 });
    for (let step = 0; step < 40 * STEPS_PER_SECOND; step++) {
      const input = { ...NO_INPUT, throttle: 1, steer: Math.sin(step / 90) * 0.4, punch: step % 45 === 0 };
      asked.step(input);
      left.step(input);
    }
    expect(asked.snapshot()).toEqual(left.snapshot());
    expect(asked.drainEvents()).toEqual(left.drainEvents());
  });
});

/**
 * A race on `difficulty`, on a closed road with no cops, in which the player,
 * on a bike with next to no condition left, has just wrecked it in the first
 * seconds by riding into the first obstacle up the road: catch-up stops once
 * the player's race is over, so from then on the opponents ride at their pace.
 */
function wreckedAtTheStart(difficulty: Difficulty, seed = 1) {
  const race = startedRace({ seed, difficulty }, { ...CLOSED_ROAD, ...NO_COPS, playerCondition: 1 });
  const start = player(race).distance;
  const first = race.track.obstacles
    .filter((obstacle) => obstacle.distance > start + 50)
    .reduce((nearest, obstacle) => (obstacle.distance < nearest.distance ? obstacle : nearest));
  secondsUntil(race, rideInto(race, first, 20), () => player(race).status === "wrecked", 60);
  return race;
}

/** The finishing time of each racer (the opponents who seldom fight, so ride at their pace) in a race raced to the finish, by rider id. */
function racersTimes(race: Race, results: RaceResults) {
  const racers = race.snapshot().riders.filter((rider) => rider.temperament === "racer");
  return racers.map(({ id }) => results.standings.find((standing) => standing.rider === id)?.time ?? null);
}

describe("the opponents' pace", () => {
  it("is slower on Easy and closer to the limit on Hard: every racer finishes later on Easy, and sooner on Hard", WHOLE_RACES, () => {
    const [easy, normal, hard] = (["easy", "normal", "hard"] as const).map((difficulty) => {
      const race = wreckedAtTheStart(difficulty);
      return racersTimes(race, race.fastForward());
    });

    expect(normal.length).toBe(6);
    normal.forEach((time, racer) => {
      expect(time).not.toBeNull();
      expect(easy[racer]).toBeGreaterThan(time! * 1.02);
      expect(hard[racer]).toBeLessThan(time! * 0.99);
    });
  });
});

/** Races in which the player gets alongside the brawler who lines up nearest them within a minute. */
const ALONGSIDE_A_BRAWLER = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24];

/**
 * Over races from `seeds` on `difficulty`, in each of which the player rides
 * up alongside the brawler who lined up nearest them and rides on beside it:
 * the steps from each of the brawler's hits on the player to its next attack
 * on them. A player who is `fightingBack` lands a punch on it first, then
 * never attacks again, and only its hits in the 5 s after that punch landed,
 * while they are fighting it back, count; any other never hits back.
 */
function waitsAfterItsHits(difficulty: Difficulty, seeds: readonly number[], fightingBack: boolean) {
  const waits: number[] = [];
  for (const seed of seeds) {
    const { race, target, input } = alongsideAn("brawler", { seed, difficulty }, NO_COPS);
    if (fightingBack) {
      const punching = () => ({ ...input(), punch: true });
      eventsUntil(race, punching, (event) => event.type === "attack-landed" && isPlayer(event.attacker) && event.target.id === target, 10);
    }
    const counted = fightingBack ? 5 * STEPS_PER_SECOND : Infinity;
    let landedAt: number | null = null;
    for (const { kind, attacker, step } of attacksOnThePlayer(race, input, fightingBack ? 12 : 40).attacks) {
      if (attacker !== target) continue;
      if (kind === "thrown" && landedAt !== null) {
        waits.push(step - landedAt);
        landedAt = null;
      }
      if (kind === "landed" && step < counted) landedAt = step;
    }
  }
  return waits;
}

describe("a breather", () => {
  it("lasts 5 s on Easy, 3 s on Normal and 1 s on Hard: after its hit lands on a player who doesn't hit back, a brawler attacks them again no sooner", WHOLE_RACES, () => {
    for (const [difficulty, breather] of [["easy", 5], ["normal", 3], ["hard", 1]] as const) {
      const waits = waitsAfterItsHits(difficulty, ALONGSIDE_A_BRAWLER.slice(0, 6), false);

      expect(waits.length, difficulty).toBeGreaterThanOrEqual(4);
      expect(Math.min(...waits), difficulty).toBeGreaterThanOrEqual(breather * STEPS_PER_SECOND);
      // Within a second of the breather's end, now and then: the breather is what holds it back.
      expect(Math.min(...waits), difficulty).toBeLessThan((breather + 1) * STEPS_PER_SECOND);
    }
  });

  it("holds on Easy and Hard while the player fights back: after its hit lands on a player who has just hit it, a brawler attacks them again no sooner, where on Normal it trades blows at once", WHOLE_RACES, () => {
    for (const [difficulty, breather] of [["easy", 5], ["hard", 1]] as const) {
      const waits = waitsAfterItsHits(difficulty, ALONGSIDE_A_BRAWLER.slice(0, 12), true);

      expect(waits.length, difficulty).toBeGreaterThanOrEqual(3);
      expect(Math.min(...waits), difficulty).toBeGreaterThanOrEqual(breather * STEPS_PER_SECOND);
      expect(Math.min(...waits), difficulty).toBeLessThan((breather + 1) * STEPS_PER_SECOND);
    }
    // On Normal, as in v1.0.0, a brawl is a brawl: it attacks a player who hits back whenever it is free to.
    const normal = waitsAfterItsHits("normal", ALONGSIDE_A_BRAWLER.slice(0, 12), true);
    expect(normal.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...normal)).toBeLessThan(1 * STEPS_PER_SECOND);
  });
});

/** The value most of `values` share (the first of those that share it most, if several do). */
function mostCommon(values: readonly number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].reduce((most, next) => (next[1] > most[1] ? next : most))[0];
}

describe("patience", () => {
  it("runs out after 2 unanswered hits on Easy, 3 on Normal and 4 on Hard: a brawler then gives up on a player who doesn't hit back for a while", WHOLE_RACES, () => {
    for (const [difficulty, hits] of [["easy", 2], ["normal", 3], ["hard", 4]] as const) {
      // Its runs of hits on the player: hits less than 10 s apart, as giving up keeps it from them for 10 s at least.
      const runs: number[] = [];
      for (const seed of ALONGSIDE_A_BRAWLER.slice(0, 6)) {
        const { race, target, input } = alongsideAn("brawler", { seed, difficulty }, NO_COPS);
        let lastHit = -Infinity;
        for (const { kind, attacker, step } of attacksOnThePlayer(race, input, 60).attacks) {
          if (attacker !== target || kind !== "landed") continue;
          if (step - lastHit >= 10 * STEPS_PER_SECOND) runs.push(1);
          else runs[runs.length - 1]++;
          lastHit = step;
        }
      }

      expect(runs.length, difficulty).toBeGreaterThanOrEqual(6);
      // Most often it gives up once its patience runs out; now and then the player gets away from it first.
      expect(mostCommon(runs), difficulty).toBe(hits);
      expect(Math.max(...runs), difficulty).toBe(hits);
    }
  });
});

/** The breather (seconds) a brawler gives a player who is fighting it back, after each of its hits on them: none on Normal. */
const BREATHER_WHEN_FOUGHT_BACK: Record<Difficulty, number> = { easy: 5, normal: 0, hard: 1 };

/**
 * The attacks the brawler who lines up nearest the player makes on them while
 * they fight it back, and the seconds it had to make them, over races from
 * `seeds` on `difficulty`: in each, the player rides up alongside it and rides
 * beside it for 30 s, punching every 4 s. The seconds counted are those in
 * which the player has landed a punch on it in the last 4 s and it is free to
 * attack them: on its bike, not already attacking, with the player, on
 * theirs, the nearest rider within its reach, and not giving them a breather
 * after its last hit on them.
 */
function attacksOnAPlayerFightingBack(difficulty: Difficulty, seeds: readonly number[]) {
  const breatherSteps = BREATHER_WHEN_FOUGHT_BACK[difficulty] * STEPS_PER_SECOND;
  let steps = 0;
  let attacks = 0;
  for (const seed of seeds) {
    const { race, target, input } = alongsideAn("brawler", { seed, difficulty }, NO_COPS);
    let sinceItsHit = Infinity;
    let sinceThePlayersHit = Infinity;
    for (let step = 0; step < 30 * STEPS_PER_SECOND; step++) {
      const { riders } = race.snapshot();
      const [me, them] = [riders[PLAYER], riders[target]];
      const free =
        sinceThePlayersHit < 4 * STEPS_PER_SECOND &&
        sinceItsHit >= breatherSteps &&
        me.status === "racing" &&
        !me.crash &&
        them.status === "racing" &&
        !them.crash &&
        !them.attack &&
        nearestWithinReach(riders, them) === PLAYER;
      race.step({ ...input(), punch: step % (4 * STEPS_PER_SECOND) === 0 });
      sinceItsHit++;
      sinceThePlayersHit++;
      for (const event of race.drainEvents()) {
        if (event.type !== "attack-thrown" && event.type !== "attack-landed") continue;
        const byIt = event.attacker.kind === "rider" && event.attacker.id === target;
        const atIt = event.target?.kind === "rider" && event.target.id === target;
        if (event.type === "attack-landed" && byIt && isPlayer(event.target)) sinceItsHit = 0;
        if (event.type === "attack-landed" && isPlayer(event.attacker) && atIt) sinceThePlayersHit = 0;
        if (event.type === "attack-thrown" && byIt && free) attacks++;
      }
      if (free) steps++;
    }
  }
  return { seconds: steps / STEPS_PER_SECOND, attacks };
}

/** Attacks a second. */
const rate = ({ seconds, attacks }: { seconds: number; attacks: number }) => attacks / seconds;
/** How far off the true rate a measured one may be by chance (one standard error): attacks come at random, so their count varies by about its square root. */
const chance = ({ seconds, attacks }: { seconds: number; attacks: number }) => Math.sqrt(attacks) / seconds;

describe("how often opponents attack the player", () => {
  it("is less often on Easy and more often on Hard: a brawler attacks a player who fights it back at its own rate on each", WHOLE_RACES, () => {
    const [easy, normal, hard] = (["easy", "normal", "hard"] as const).map((difficulty) => attacksOnAPlayerFightingBack(difficulty, ALONGSIDE_A_BRAWLER));

    // A brawler attacks a player within its reach about 1.8 times a second on Normal.
    expect(rate(normal)).toBeGreaterThan(1.2);
    expect(rate(normal)).toBeLessThan(2.4);
    // Further apart than chance could put them.
    expect(rate(normal) - rate(easy)).toBeGreaterThan(3 * Math.hypot(chance(normal), chance(easy)));
    expect(rate(hard) - rate(normal)).toBeGreaterThan(3 * Math.hypot(chance(hard), chance(normal)));
  });
});

/**
 * Where the opponent `target` is in `race`, stepped `steps` times by `step`:
 * its speed as it first passed each 10 m mark along the track, and how far
 * ahead of the player it was then (metres).
 */
function passing(race: Race, target: RiderId, steps: number, step: () => void) {
  const marks = new Map<number, { speed: number; ahead: number }>();
  for (let i = 0; i < steps; i++) {
    step();
    const { riders } = race.snapshot();
    const them = riders[target];
    const mark = Math.round(them.distance / 10) * 10;
    if (them.status === "racing" && !them.crash && !marks.has(mark)) marks.set(mark, { speed: them.speed, ahead: them.distance - riders[PLAYER].distance });
  }
  return marks;
}

/**
 * How fast the racer who lines up nearest the player rides each of `aheads`
 * metres in front of them on `difficulty`, as a share of its pace: its speed
 * where it is that far ahead of a player who follows it, within 15% or 5 m,
 * against its speed at the same marks of the track in the race in which the
 * player has wrecked at the start, where it rides at its pace. The median over
 * the marks from 1 km on, in the first 90 s, and how many there are.
 */
function sharesOfItsPace(difficulty: Difficulty, aheads: readonly number[], seed = 1) {
  const followed = aheads.map((ahead) => {
    const race = startedRace({ seed, difficulty }, { ...CLOSED_ROAD, ...NO_COPS });
    const target = nearestOpponent(race, "racer");
    const start = player(race).distance;
    // The player follows it at its speed, closing in or dropping back at up to 6 m/s.
    const following = autopilot(race, {
      lane: 1.5,
      targetSpeed: ({ riders }) => riders[target].speed + Math.max(-6, Math.min(6, 0.4 * (riders[target].distance - riders[PLAYER].distance - ahead))),
    });
    return { ahead, target, start, marks: passing(race, target, 90 * STEPS_PER_SECOND, () => race.step(following())) };
  });
  const wrecked = wreckedAtTheStart(difficulty, seed);
  const atItsPace = passing(wrecked, followed[0].target, 90 * STEPS_PER_SECOND, () => wrecked.fastForward(1));
  return followed.map(({ ahead, start, marks }) => {
    const shares = [...marks]
      .filter(([mark, at]) => mark >= start + 1000 && Math.abs(at.ahead - ahead) <= Math.max(5, 0.15 * ahead) && atItsPace.has(mark))
      .map(([mark, { speed }]) => speed / atItsPace.get(mark)!.speed)
      .sort((a, b) => a - b);
    return { share: shares[Math.floor(shares.length / 2)], marks: shares.length };
  });
}

describe("catch-up on Easy", () => {
  it("slows an opponent ahead of the player from 25 m, and by the full 8% from 150 m: at its pace 15 m ahead of them, slower 100 m ahead, 8% slower 200 m ahead", WHOLE_RACES, () => {
    const [near, between, far] = sharesOfItsPace("easy", [15, 100, 200]);

    for (const { marks } of [near, between, far]) expect(marks).toBeGreaterThan(50);
    expect(near.share).toBeCloseTo(1, 2);
    expect(between.share).toBeGreaterThan(0.93);
    expect(between.share).toBeLessThan(0.97);
    expect(far.share).toBeCloseTo(0.92, 2);
  });
});
