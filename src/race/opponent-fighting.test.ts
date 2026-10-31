import { describe, expect, it } from "vitest";
import { NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race, type RaceEvent, type Temperament } from ".";
import {
  alongsideAn,
  alongsideARacer,
  type AttackOnThePlayer,
  type AttackThrown,
  attacksOnThePlayer,
  autopilot,
  CLOSED_ROAD,
  eventsUntil,
  nearestWithinReach,
  NO_COPS,
  player,
  secondsUntil,
  startedRace,
  STEPS_PER_SECOND,
  WHOLE_RACES,
} from "./test-helpers";

/** Seconds an opponent spent free to attack with someone within reach, and the attacks it threw in that time. */
interface Tally {
  seconds: number;
  attacks: number;
}

/** Tallies by temperament, for when the nearest rider within an opponent's reach was the player, and when it was another opponent. */
type Tallies = Record<"player" | "opponent", Record<Temperament, Tally>>;

const emptyTallies = (): Tallies => ({
  player: { racer: { seconds: 0, attacks: 0 }, brawler: { seconds: 0, attacks: 0 }, bully: { seconds: 0, attacks: 0 } },
  opponent: { racer: { seconds: 0, attacks: 0 }, brawler: { seconds: 0, attacks: 0 }, bully: { seconds: 0, attacks: 0 } },
});


/** An opponent whose hit lands on a player who doesn't hit back gives them this many seconds before its next attack... */
const BREATHER_SECONDS = 3;
/** ...and gives up on them once this many of its hits have landed. */
const UNANSWERED_HITS = 3;

/**
 * Rides `race` with `input` for up to `seconds`, or until the player's race is
 * over, and tallies, at every step, each opponent on its bike and not already
 * attacking that has someone within reach: whether the nearest of them is the
 * player or another opponent, and whether the opponent attacks. The player
 * never hits back, so an opponent isn't free to attack them for
 * `BREATHER_SECONDS` after each of its hits lands on them, nor, once
 * `UNANSWERED_HITS` of its hits have landed, until it comes back and attacks
 * them again, having given up on them. Every attack the opponents throw goes
 * into `thrown`.
 */
function tallyAttacks(tallies: Tallies, race: Race, input: () => PlayerInput, seconds: number, thrown: AttackThrown[]) {
  /** Until when (race clock) each opponent gives the player a breather. */
  const breathers = new Map<number, number>();
  /** How many of each opponent's hits have landed on the player since it last gave up on them, and those that have. */
  const unanswered = new Map<number, number>();
  const gaveUp = new Set<number>();
  for (let step = 0; step < seconds / STEP_SECONDS && player(race).status === "racing"; step++) {
    const { clock, riders: before } = race.snapshot();
    const free = before.filter((rider) => rider.temperament && rider.status === "racing" && !rider.crash && !rider.attack);
    const nearest = free.map((rider) => nearestWithinReach(before, rider));
    race.step(input());
    const events = race.drainEvents();
    for (const event of events) {
      if (event.type === "attack-landed" && event.target.kind === "rider" && event.target.id === PLAYER) {
        breathers.set(event.attacker.id, race.snapshot().clock + BREATHER_SECONDS);
        const hits = (unanswered.get(event.attacker.id) ?? 0) + 1;
        unanswered.set(event.attacker.id, hits % UNANSWERED_HITS);
        if (hits === UNANSWERED_HITS) gaveUp.add(event.attacker.id);
      }
      if (event.type === "attack-thrown" && event.target?.kind === "rider" && event.target.id === PLAYER) gaveUp.delete(event.attacker.id);
    }
    const byOpponents = events.filter((event): event is AttackThrown => event.type === "attack-thrown" && event.attacker.id !== PLAYER);
    thrown.push(...byOpponents);
    const attackers = new Set(byOpponents.map((event) => event.attacker.id));
    free.forEach((rider, index) => {
      if (nearest[index] === null || !rider.temperament) return;
      if (nearest[index] === PLAYER && (clock < (breathers.get(rider.id) ?? -Infinity) || gaveUp.has(rider.id))) return;
      const tally = tallies[nearest[index] === PLAYER ? "player" : "opponent"][rider.temperament];
      tally.seconds += STEP_SECONDS;
      if (attackers.has(rider.id)) tally.attacks++;
    });
  }
}

/** Attacks per second of having someone within reach. */
const rate = ({ seconds, attacks }: Tally) => attacks / seconds;

describe("opponents", () => {
  // Three races ridden at the field's pace, on closed roads, so the opponents get plenty of chances to attack the player
  // and each other, with no cars to keep them apart; and long rides alongside a racer, since racers don't come looking
  // for a fight, and alongside a bully, who lines up far from the player and takes a breather between their hits on a
  // player who doesn't hit back. (Not alongside a brawler: matching its speed from the start, the player rides too slowly
  // for its patience, and it gives up on them, which the tally can't tell from its being free to attack.)
  const tallies = emptyTallies();
  const thrown: AttackThrown[] = [];
  for (const seed of [1, 2, 3]) {
    const race = startedRace(seed, CLOSED_ROAD);
    tallyAttacks(tallies, race, autopilot(race, { targetSpeed: 48 }), 300, thrown);
  }
  for (const alongside of [alongsideARacer(), alongsideAn("bully")]) {
    tallyAttacks(tallies, alongside.race, alongside.input, 60, thrown);
  }

  it("only throw attacks that reach someone: a bully never kicks at a rider its kick can't reach", () => {
    expect(thrown.filter((event) => event.kind === "kick").length).toBeGreaterThan(10);
    expect(thrown.filter((event) => event.target === null)).toEqual([]);
  });

  it("leave the cops alone, throwing their attacks only at riders", () => {
    expect(thrown.length).toBeGreaterThan(50);
    expect(thrown.filter((event) => event.target?.kind !== "rider")).toEqual([]);
  });

  it("give up on a player who rides well below their pace: no brawler or bully rides along with a slow player for long", () => {
    // The player holds the throttle and never steers, so the bends carry them off the road and they ride on along the
    // shoulder, at no more than 65 km/h most of the time.
    const race = startedRace(1, CLOSED_ROAD);
    const riding = { ...NO_INPUT, throttle: 1 };
    /** Seconds each brawler and bully spent on its bike within 10 m of the player, along the track, while the player rode slowly. */
    const secondsAlong = new Map<number, number>();
    let slowSeconds = 0;
    for (let step = 0; step < 120 / STEP_SECONDS; step++) {
      race.step(riding);
      race.drainEvents();
      const { riders } = race.snapshot();
      const me = riders[PLAYER];
      if (me.speed >= 30) continue;
      slowSeconds += STEP_SECONDS;
      for (const rider of riders) {
        const fighter = rider.temperament === "brawler" || rider.temperament === "bully";
        if (fighter && rider.status === "racing" && !rider.crash && Math.abs(rider.distance - me.distance) <= 10) {
          secondsAlong.set(rider.id, (secondsAlong.get(rider.id) ?? 0) + STEP_SECONDS);
        }
      }
    }

    expect(slowSeconds).toBeGreaterThan(80);
    expect(secondsAlong.size).toBeGreaterThan(0);
    expect(Math.max(...secondsAlong.values())).toBeLessThan(20);
  });

  it("attack the player often if they are brawlers or bullies", () => {
    for (const temperament of ["brawler", "bully"] as const) {
      expect(tallies.player[temperament].seconds).toBeGreaterThan(5);
      expect(rate(tallies.player[temperament])).toBeGreaterThan(0.8);
    }
  });

  it("rarely attack the player if they are racers", () => {
    expect(tallies.player.racer.seconds).toBeGreaterThan(20);
    expect(rate(tallies.player.racer)).toBeLessThan(0.25);
  });

  it("drop back when badly beaten, without attacking, until they have recovered", () => {
    const { race, target, input } = alongsideAn("brawler");
    const them = () => race.snapshot().riders[target];
    const punching = () => ({ ...input(), punch: true });
    secondsUntil(race, punching, () => them().stamina < 30, 10);
    race.drainEvents();
    const cruising = autopilot(race, { targetSpeed: 40, lane: player(race).offset });
    const fallsBehind: number[] = [];
    const attacksWhileBeaten: RaceEvent[] = [];

    secondsUntil(race, cruising, () => {
      fallsBehind.push(player(race).distance - them().distance);
      attacksWhileBeaten.push(...race.drainEvents().filter((event) => event.type === "attack-thrown" && event.attacker.id === target));
      return them().stamina >= 80;
    }, 30);

    expect(Math.max(...fallsBehind)).toBeGreaterThan(15);
    expect(attacksWhileBeaten).toEqual([]);

    // Once recovered, they stop hanging back and ride up to the player again.
    const easingOff = autopilot(race, { targetSpeed: 30, lane: player(race).offset });
    const comingBack = secondsUntil(race, easingOff, () => Math.abs(player(race).distance - them().distance) < 5, 30);
    expect(comingBack).toBeLessThan(30);
  });

  it("attack the player far more readily than each other, but now and then each other too", () => {
    for (const temperament of ["brawler", "bully"] as const) {
      expect(tallies.opponent[temperament].seconds).toBeGreaterThan(10);
      expect(rate(tallies.player[temperament])).toBeGreaterThan(4 * rate(tallies.opponent[temperament]));
      expect(tallies.opponent[temperament].attacks).toBeGreaterThan(0);
    }
  });
});

/** The attacks on the player, of those tallied, that brawlers and bullies in `race` made. */
function byFighters(race: Race, attacks: readonly AttackOnThePlayer[]) {
  const { riders } = race.snapshot();
  return attacks.filter(({ attacker }) => riders[attacker].temperament === "brawler" || riders[attacker].temperament === "bully");
}

describe("fights with the player", () => {
  it("are one at a time: while a brawler or bully fights a player who doesn't hit back, the others wait their turn", WHOLE_RACES, () => {
    // A slow player who never attacks, from the back of the grid, where the slower fighters line up around them.
    let pileOns = 0;
    let thrown = 0;
    for (const seed of [1, 2, 3]) {
      const race = startedRace(seed, { ...CLOSED_ROAD, ...NO_COPS });
      const { attacks } = attacksOnThePlayer(race, autopilot(race, { targetSpeed: 40, lane: 1.5 }), 60);
      const throws = byFighters(race, attacks).filter(({ kind }) => kind === "thrown");
      thrown += throws.length;
      // Two fighters' attacks at the player within 2 s of each other: they are ganging up on them.
      throws.forEach(({ attacker, step }, index) => {
        if (throws.slice(0, index).some((other) => other.attacker !== attacker && step - other.step < 2 * STEPS_PER_SECOND)) pileOns++;
      });
    }
    expect(thrown).toBeGreaterThan(10);
    expect(pileOns).toBeLessThanOrEqual(1);
  });

  it("end once three of a fighter's hits have landed on a player who never hits back: it gives up on them, and lands no more for 10 s at least", WHOLE_RACES, () => {
    // A slow player who never attacks, from the back of the grid, where the slower fighters line up around them.
    /** Each fighter's runs of hits on the player: hits less than 10 s apart. */
    const runs: string[] = [];
    let landed = 0;
    for (const seed of [1, 2, 3]) {
      const race = startedRace(seed, { ...CLOSED_ROAD, ...NO_COPS });
      const { attacks } = attacksOnThePlayer(race, autopilot(race, { targetSpeed: 40, lane: 1.5 }), 90);
      const hits = byFighters(race, attacks).filter(({ kind }) => kind === "landed");
      landed += hits.length;
      for (const attacker of new Set(hits.map((hit) => hit.attacker))) {
        let run: number[] = [];
        for (const { step } of hits.filter((hit) => hit.attacker === attacker)) {
          if (run.length > 0 && step - run[run.length - 1] >= 10 * STEPS_PER_SECOND) run = [];
          run.push(step);
          if (run.length > UNANSWERED_HITS) runs.push(`seed ${seed}, rider ${attacker}: ${run.map((at) => (at / STEPS_PER_SECOND).toFixed(1)).join(", ")} s`);
        }
      }
    }

    expect(landed).toBeGreaterThan(5);
    expect(runs).toEqual([]);
  });

  it("give a player who doesn't hit back 3 s after each hit that lands on them, and trade blows at the full rate with one who does", () => {
    const { race, target, input } = alongsideAn("brawler");
    const theirs = (attacks: readonly AttackOnThePlayer[]) => attacks.filter(({ attacker }) => attacker === target);
    const passive = theirs(attacksOnThePlayer(race, input, 30).attacks);
    const landed = passive.filter(({ kind }) => kind === "landed");
    expect(landed.length).toBeGreaterThanOrEqual(3);
    for (const hit of landed) {
      const next = passive.find(({ kind, step }) => kind === "thrown" && step > hit.step);
      if (next) expect(next.step - hit.step).toBeGreaterThanOrEqual(BREATHER_SECONDS * STEPS_PER_SECOND);
    }

    // Hitting back, the player gets no such pause: once one of their punches lands, the brawler trades blows at once.
    const punching = () => ({ ...input(), punch: true });
    eventsUntil(race, punching, (event) => event.type === "attack-landed" && event.attacker.id === PLAYER && event.target.id === target, 10);
    const brawl = theirs(attacksOnThePlayer(race, input, BREATHER_SECONDS).attacks).filter(({ kind }) => kind === "thrown");
    expect(brawl.length).toBeGreaterThanOrEqual(2);
  });

  it("leave a slow player who doesn't hit back riding among riders for most of the race, not pounded off and left alone", WHOLE_RACES, () => {
    for (const seed of [1, 2, 3]) {
      const race = startedRace(seed, { ...CLOSED_ROAD, ...NO_COPS });
      const riding = autopilot(race, { targetSpeed: 40, lane: 1.5 });
      let steps = 0;
      let withSomeone = 0;
      secondsUntil(race, riding, () => {
        const { riders } = race.snapshot();
        const me = riders[PLAYER];
        if (me.status !== "racing") return true;
        steps++;
        if (riders.some((rider) => rider.id !== PLAYER && rider.status === "racing" && Math.abs(rider.distance - me.distance) < 50)) {
          withSomeone++;
        }
        return false;
      }, 300);
      expect(withSomeone / steps).toBeGreaterThan(0.5);
    }
  });

  it("leave a player who rides without hitting back on their bike for the first minute", WHOLE_RACES, () => {
    // A slow player who never attacks, in races with traffic and cops: the fighters at the back of the grid are on them
    // from the start.
    const knockedOff: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const race = startedRace(seed);
      knockedOff.push(...attacksOnThePlayer(race, autopilot(race, { targetSpeed: 40, lane: 1.5 }), 60).knockOffs);
    }
    expect(knockedOff).toEqual([]);
  });
});
