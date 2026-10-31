import { describe, expect, it } from "vitest";
import { createRace, isPlayer, NO_INPUT, PLAYER, type Difficulty, type PlayerInput, type Race } from ".";
import {
  autopilot,
  CLOSED_ROAD,
  eventsUntil,
  nearestOpponent,
  nearestWithinReach,
  NO_COPS,
  player,
  rideAlongside,
  rideInto,
  secondsUntil,
  setUpRace,
  stepFor,
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
    digest.add(race.snapshot());
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
 * Digests of two races recorded with v1.0.0 (seed 1, on a closed road with no
 * cops, so that nothing of the riding fixes since touches them): every ten
 * seconds of race until the player finished, then the rest of the field to
 * the finish and the results. Hitting back always, the player finished 11th
 * in 3:16.84; hitting back now and then, they took 13 hits, the opponents'
 * breathers, patience and attacks on the player deciding what came next, and
 * finished 13th in 3:16.66.
 */
const RECORDED_ON_V1: Record<HitsBack, readonly string[]> = {
  always: [
    "13d27736b9565c", "16bc41d081b3d7", "055fc3a36cc674", "0374600ebe28ea", "082b25d76bb991",
    "13447577b11809", "17d27997c5c221", "12dd096a574678", "034eaf823f5369", "1f5a246e6da7a3",
    "1b63fa3d70d453", "133c133a0d705c", "003060df7b57f9", "023120bcb2388f", "0eb557fac3cc0d",
    "198432ee249331", "05373aee90b5a2", "06ef081e64a184", "0063fe0ba7900e", "1f30a5b66aed89",
  ],
  "now and then": [
    "13d27736b9565c", "05c14e8350ee2c", "1bc30c2cf9ed18", "19944937cb9a12", "130d878905a552",
    "11d5d752ee73f2", "1ca38a44f4afdb", "023eed50826989", "077a309fc978ca", "119df3cbd99563",
    "177958a06e02a0", "09493d90ec3c2e", "05bfe33cacaa36", "04c1d587a8a571", "008cc367b563cf",
    "07d8717a64b222", "023501885206d4", "0e2f8602f66b6e", "07a19c6bf0d0eb", "1ea2369ccaae69",
  ],
};

describe("a race on Normal", () => {
  it("replays a race recorded with v1.0.0 byte for byte, whether Normal is asked for or left to the default", WHOLE_RACES, () => {
    expect(digestsOf(setUpRace({ seed: 1, difficulty: "normal" }, { ...CLOSED_ROAD, ...NO_COPS }), "always")).toEqual(RECORDED_ON_V1.always);
    expect(digestsOf(setUpRace({ seed: 1 }, { ...CLOSED_ROAD, ...NO_COPS }), "always")).toEqual(RECORDED_ON_V1.always);
  });

  it("replays byte for byte a race recorded with v1.0.0 in which the player hits back only now and then, so that its breathers, patience and attacks come into play", WHOLE_RACES, () => {
    expect(digestsOf(setUpRace({ seed: 1 }, { ...CLOSED_ROAD, ...NO_COPS }), "now and then")).toEqual(RECORDED_ON_V1["now and then"]);
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
 * on a bike with next to no condition left, wrecked it in the first seconds
 * by riding into the first obstacle up the road, raced to the finish:
 * catch-up stops once the player's race is over, so the opponents ride at
 * their pace.
 */
function wreckedAtTheStart(difficulty: Difficulty, seed = 1) {
  const race = setUpRace({ seed, difficulty }, { ...CLOSED_ROAD, ...NO_COPS, playerCondition: 1 });
  stepFor(race, 3);
  const start = player(race).distance;
  const first = race.track.obstacles
    .filter((obstacle) => obstacle.distance > start + 50)
    .reduce((nearest, obstacle) => (obstacle.distance < nearest.distance ? obstacle : nearest));
  secondsUntil(race, rideInto(race, first, 20), () => player(race).status === "wrecked", 60);
  return { race, results: race.fastForward() };
}

/** The finishing time of each racer (the opponents who seldom fight, so ride at their pace), by rider id. */
function racersTimes({ race, results }: ReturnType<typeof wreckedAtTheStart>) {
  const racers = race.snapshot().riders.filter((rider) => rider.temperament === "racer");
  return racers.map(({ id }) => results.standings.find((standing) => standing.rider === id)?.time ?? null);
}

describe("the opponents' pace", () => {
  it("is a little slower on Easy and closer to the limit on Hard: every racer finishes later on Easy, and sooner on Hard", WHOLE_RACES, () => {
    const [easy, normal, hard] = (["easy", "normal", "hard"] as const).map((difficulty) => racersTimes(wreckedAtTheStart(difficulty)));

    expect(normal.length).toBe(6);
    normal.forEach((time, racer) => {
      expect(time).not.toBeNull();
      expect(easy[racer]).toBeGreaterThan(time! * 1.02);
      expect(hard[racer]).toBeLessThan(time! * 0.99);
    });
  });
});

/**
 * A started race on `difficulty`, on a closed road with no cops, in which the
 * player has ridden up alongside the brawler who lined up nearest them, so
 * that it is the nearest rider within reach, and the scripted input that
 * holds them there.
 */
function alongsideABrawler(difficulty: Difficulty, seed = 1) {
  const race = setUpRace({ seed, difficulty }, { ...CLOSED_ROAD, ...NO_COPS });
  stepFor(race, 3);
  const target = nearestOpponent(race, "brawler");
  const input = rideAlongside(race, target);
  secondsUntil(race, input, () => {
    const { riders } = race.snapshot();
    return nearestWithinReach(riders, riders[PLAYER]) === target;
  }, 60);
  race.drainEvents();
  return { race, target, input };
}

/**
 * Rides `race` with `input`, the player never hitting back, for `seconds`,
 * and lists the attacks the rider `attacker` threw at the player and landed
 * on them, by race clock.
 */
function attacksOnThePlayerBy(race: Race, attacker: number, input: () => PlayerInput, seconds: number) {
  const thrown: number[] = [];
  const landed: number[] = [];
  for (let step = 0; step < seconds * STEPS_PER_SECOND; step++) {
    race.step(input());
    const { clock } = race.snapshot();
    for (const event of race.drainEvents()) {
      if (event.type !== "attack-thrown" && event.type !== "attack-landed") continue;
      if (event.attacker.kind !== "rider" || event.attacker.id !== attacker) continue;
      if (event.target?.kind !== "rider" || event.target.id !== PLAYER) continue;
      (event.type === "attack-thrown" ? thrown : landed).push(clock);
    }
  }
  return { thrown, landed };
}

describe("a breather", () => {
  it("lasts 5 s on Easy, 3 s on Normal and 1 s on Hard: after its hit lands on a player who doesn't hit back, a brawler attacks them again no sooner", () => {
    for (const [difficulty, breather, soon] of [["easy", 5, null], ["normal", 3, 4], ["hard", 1, 2]] as const) {
      const { race, target, input } = alongsideABrawler(difficulty);
      const { thrown, landed } = attacksOnThePlayerBy(race, target, input, 40);
      const waits = landed.flatMap((hit) => thrown.filter((at) => at > hit).slice(0, 1).map((at) => at - hit));

      expect(waits.length, difficulty).toBeGreaterThanOrEqual(2);
      expect(Math.min(...waits), difficulty).toBeGreaterThanOrEqual(breather);
      // Within a second of the breather's end, now and then, at Normal's rate of attacks or more: the breather is what holds it back.
      if (soon !== null) expect(Math.min(...waits), difficulty).toBeLessThan(soon);
    }
  });
});

/**
 * Over races from `seeds` on `difficulty`, in each of which the player rides
 * up alongside the brawler who lined up nearest them, lands a punch on it and
 * rides on beside it without attacking: the steps from each of the brawler's
 * hits that landed on the player while they were fighting it back (in the 5 s
 * after their punch landed) to its next attack on them.
 */
function waitsAfterHitsOnAPlayerFightingBack(difficulty: Difficulty, seeds: readonly number[]) {
  const waits: number[] = [];
  for (const seed of seeds) {
    const { race, target, input } = alongsideABrawler(difficulty, seed);
    const punching = () => ({ ...input(), punch: true });
    eventsUntil(race, punching, (event) => event.type === "attack-landed" && isPlayer(event.attacker) && event.target.id === target, 10);
    let landedAt: number | null = null;
    for (let step = 1; step <= 12 * STEPS_PER_SECOND; step++) {
      race.step(input());
      for (const event of race.drainEvents()) {
        if (event.type !== "attack-thrown" && event.type !== "attack-landed") continue;
        if (event.attacker.kind !== "rider" || event.attacker.id !== target || event.target?.kind !== "rider" || event.target.id !== PLAYER) continue;
        if (event.type === "attack-thrown" && landedAt !== null) {
          waits.push(step - landedAt);
          landedAt = null;
        }
        if (event.type === "attack-landed" && step < 5 * STEPS_PER_SECOND) landedAt = step;
      }
    }
  }
  return waits;
}

describe("a breather on Easy and Hard", () => {
  it("holds while the player fights back: after its hit lands on a player who has just hit it, a brawler attacks them again no sooner, where on Normal it trades blows at once", WHOLE_RACES, () => {
    const seeds = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    for (const [difficulty, breather] of [["easy", 5], ["hard", 1]] as const) {
      const waits = waitsAfterHitsOnAPlayerFightingBack(difficulty, seeds);

      expect(waits.length, difficulty).toBeGreaterThanOrEqual(3);
      expect(Math.min(...waits), difficulty).toBeGreaterThanOrEqual(breather * STEPS_PER_SECOND);
      // Within a second of the breather's end, now and then: the breather is what holds it back.
      expect(Math.min(...waits), difficulty).toBeLessThan((breather + 1) * STEPS_PER_SECOND);
    }
    // On Normal, as in v1.0.0, a brawl is a brawl: it attacks a player who hits back whenever it is free to.
    const normal = waitsAfterHitsOnAPlayerFightingBack("normal", seeds);
    expect(normal.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...normal)).toBeLessThan(1 * STEPS_PER_SECOND);
  });
});

describe("patience", () => {
  it("runs out after 2 unanswered hits on Easy, 3 on Normal and 4 on Hard: a brawler then gives up on a player who doesn't hit back for a while", () => {
    for (const [difficulty, hits] of [["easy", 2], ["normal", 3], ["hard", 4]] as const) {
      const { race, target, input } = alongsideABrawler(difficulty);
      const { landed } = attacksOnThePlayerBy(race, target, input, 60);
      // Its runs of hits on the player: hits less than 10 s apart, as giving up keeps it from them for 10 s at least.
      const runs: number[] = [];
      landed.forEach((at, index) => {
        if (index === 0 || at - landed[index - 1] >= 10) runs.push(1);
        else runs[runs.length - 1]++;
      });

      expect(runs.length, difficulty).toBeGreaterThanOrEqual(2);
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
    const { race, target, input } = alongsideABrawler(difficulty, seed);
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
    // Races in which the player gets alongside that brawler within a minute.
    const seeds = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24];
    const [easy, normal, hard] = (["easy", "normal", "hard"] as const).map((difficulty) => attacksOnAPlayerFightingBack(difficulty, seeds));

    // A brawler attacks a player within its reach about 1.8 times a second on Normal.
    expect(rate(normal)).toBeGreaterThan(1.2);
    expect(rate(normal)).toBeLessThan(2.4);
    // Further apart than chance could put them.
    expect(rate(normal) - rate(easy)).toBeGreaterThan(3 * Math.hypot(chance(normal), chance(easy)));
    expect(rate(hard) - rate(normal)).toBeGreaterThan(3 * Math.hypot(chance(hard), chance(normal)));
  });
});

/**
 * How many opponents are within 150 m ahead of a struggling player, on
 * average over the first two and a half minutes of races from `seeds` on
 * `difficulty`, on a closed road with no cops: the player rides at no more
 * than 36 m/s (130 km/h), slowing for the bends, and never hits back.
 */
function opponentsJustAheadOfASlowPlayer(difficulty: Difficulty, seeds: readonly number[]) {
  let steps = 0;
  let ahead = 0;
  for (const seed of seeds) {
    const race = setUpRace({ seed, difficulty }, { ...CLOSED_ROAD, ...NO_COPS });
    stepFor(race, 3);
    const input = autopilot(race, { targetSpeed: 36, lane: 1.5 });
    for (let step = 0; step < 150 * STEPS_PER_SECOND && player(race).status === "racing"; step++) {
      race.step(input());
      const { riders } = race.snapshot();
      const me = riders[PLAYER];
      steps++;
      ahead += riders.filter((rider) => rider.id !== PLAYER && rider.status === "racing" && rider.distance > me.distance && rider.distance - me.distance < 150).length;
    }
  }
  return ahead / steps;
}

describe("catch-up", () => {
  it("holds the field nearer a struggling player on Easy, slowing opponents from 25 m ahead of them and by the full 8% from 150 m", WHOLE_RACES, () => {
    const seeds = [1, 2, 3];

    // On Normal, an opponent slows only from 75 m ahead, by the full 8% from 400 m, and most ride on out of sight.
    expect(opponentsJustAheadOfASlowPlayer("normal", seeds)).toBeLessThan(2);
    // On Easy they ride slower too, which on its own keeps fewer than 4 of them there (3.4, with Normal's catch-up).
    expect(opponentsJustAheadOfASlowPlayer("easy", seeds)).toBeGreaterThan(4.4);
  });
});
