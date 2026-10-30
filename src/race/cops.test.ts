import { describe, expect, it } from "vitest";
import { createRace, NO_INPUT, PLAYER, type PlayerInput, type Race, type RaceEvent, type RiderId } from ".";
import {
  alongsideARacer,
  alongsideTheFirstCop,
  apart,
  autopilot,
  CLOSED_ROAD,
  eventsDuring,
  eventsUntil,
  kmh,
  player,
  secondsUntil,
  startedRace,
  STEPS_PER_SECOND,
} from "./test-helpers";

const ME = { kind: "rider", id: PLAYER } as const;
const FIRST_COP = { kind: "cop", id: 0 } as const;

/**
 * A started race in which the player has ridden alongside a racer (an
 * opponent who rarely attacks) until they have just passed the first cop, so
 * that it has joined the race.
 */
function alongsideARacerPastTheFirstCop(seed = 2) {
  const alongside = alongsideARacer(seed);
  const { race, input } = alongside;
  const cop = race.snapshot().cops[0];
  secondsUntil(race, input, () => player(race).distance >= cop.distance, 120);
  race.drainEvents();
  return alongside;
}

/**
 * A started race in which the player has ridden alongside a racer until they
 * are `before` metres short of the first cop, still waiting on the shoulder.
 */
function alongsideARacerNearingTheFirstCop(before: number, seed = 1) {
  const alongside = alongsideARacer(seed);
  const { race, input } = alongside;
  const cop = race.snapshot().cops[0];
  secondsUntil(race, input, () => player(race).distance >= cop.distance - before, 120);
  race.drainEvents();
  return alongside;
}

/**
 * Rides with `input`, punching the opponent `target` down to no stamina and
 * keeping it there, until `when` holds; then punches it off its bike. Returns
 * every event on the way, its crash last.
 */
function knockOffWhen(race: Race, target: RiderId, input: () => PlayerInput, when: () => boolean) {
  const punching = () => ({ ...input(), punch: race.snapshot().riders[target].stamina > 0 || when() });
  return eventsUntil(race, punching, (event) => event.type === "crash" && event.rider === target, 45);
}

/**
 * A started race in which the player, riding alongside a racer, has beaten it
 * down on the way to the first cop and knocked it off just past the cop, as it
 * pulls out to join the race: the cop is close behind the racer.
 */
function racerKnockedOffJustPastTheFirstCop(seed = 1) {
  const alongside = alongsideARacerNearingTheFirstCop(150, seed);
  const { race, target, input } = alongside;
  const cop = () => race.snapshot().cops[0];
  const them = () => race.snapshot().riders[target];
  const events = knockOffWhen(race, target, input, () => them().distance - cop().distance > 2);
  return { ...alongside, cop, them, events };
}

/**
 * A started race in which the player, riding alongside a racer past the first
 * cop, has knocked it off with the cop following them at speed at its usual
 * gap, about 1.5 s behind them at their speed, and within 80 m.
 */
function racerKnockedOffAheadOfTheFollowingCop(seed = 2) {
  const alongside = alongsideARacerPastTheFirstCop(seed);
  const { race, target, input } = alongside;
  const cop = () => race.snapshot().cops[0];
  const them = () => race.snapshot().riders[target];
  const gap = () => them().distance - cop().distance;
  let speed = NaN;
  let behind = NaN;
  knockOffWhen(race, target, input, () => {
    [speed, behind] = [them().speed, gap()];
    return behind >= 1.4 * speed && behind < 80 && cop().speed > 20;
  });
  return { ...alongside, cop, them, speed, behind };
}

/**
 * A started race in traffic in which the first cop has joined the race and
 * followed the player for 8 s, and the player, riding at 54 m/s or more, has
 * ridden flat out into the back of a car going their way. Returns how far the
 * cop was behind their bike when they crashed.
 */
function crashedAtSpeedAheadOfTheFollowingCop(seed: number) {
  const race = startedRace(seed);
  const pilot = autopilot(race);
  const cop = () => race.snapshot().cops[0];
  secondsUntil(race, pilot, () => player(race).distance >= cop().distance, 150);
  const joined = race.snapshot().clock;
  const carAhead = () =>
    race
      .snapshot()
      .traffic.filter((car) => !car.oncoming && car.distance - player(race).distance > 60 && car.distance - player(race).distance < 200)
      .sort((a, b) => a.distance - b.distance)[0];
  secondsUntil(race, pilot, () => race.snapshot().clock > joined + 8 && player(race).speed >= 55 && carAhead() !== undefined, 100);
  const { id } = carAhead();
  const flatOutInto = (): PlayerInput => {
    const car = race.snapshot().traffic.find((each) => each.id === id);
    return { ...NO_INPUT, throttle: 1, steer: car ? Math.max(-1, Math.min(1, 1.5 * (car.offset - player(race).offset))) : 0 };
  };
  let speed = NaN;
  eventsUntil(race, () => ((speed = player(race).speed), flatOutInto()), (event) => event.type === "crash" && event.rider === PLAYER, 20);
  return { race, cop, speed, behind: player(race).bike.distance - cop().distance };
}

/**
 * Rides `race` with `input` until `done` holds, for at most `seconds`,
 * checking after every step that the cops the race has called near the
 * player (with cop-near, and no cop-gone since) are the cops in the race
 * within 150 m of them, as their snapshots say too. `near` holds those cops
 * from one ride to the next. Adds the cop-near and cop-gone events to
 * `alerts`, and returns them.
 */
function rideWatchingTheCops(
  race: Race,
  input: () => PlayerInput,
  done: () => boolean,
  seconds: number,
  near: Set<number>,
  alerts: RaceEvent[] = [],
) {
  secondsUntil(
    race,
    () => {
      for (const event of race.drainEvents()) {
        if (event.type === "cop-near") near.add(event.cop);
        if (event.type === "cop-gone") near.delete(event.cop);
        if (event.type === "cop-near" || event.type === "cop-gone") alerts.push(event);
      }
      const { riders, cops } = race.snapshot();
      const within = cops.filter((cop) => cop.status === "riding" && apart(cop, riders[PLAYER]) <= 150).map((cop) => cop.id);
      expect([...near].sort()).toEqual(within);
      expect(cops.filter((cop) => cop.near).map((cop) => cop.id)).toEqual(within);
      return input();
    },
    done,
    seconds,
  );
  return alerts;
}

describe("fighting a cop", () => {
  it("is punching and kicking it like a rider: a cop starts with 150 stamina, a punch lowers it by 18 and a kick by 6", () => {
    const { race, input } = alongsideTheFirstCop();
    expect(race.snapshot().cops[0].stamina).toBe(150);

    race.step({ ...input(), punch: true });
    const punch = [...race.drainEvents(), ...eventsDuring(race, 0.5, input)];

    expect(punch).toContainEqual({ type: "attack-thrown", attacker: ME, target: FIRST_COP, kind: "punch" });
    expect(punch).toContainEqual({ type: "attack-landed", attacker: ME, target: FIRST_COP, kind: "punch" });
    expect(race.snapshot().cops[0].stamina).toBe(132);

    race.step({ ...input(), kick: true });
    const kick = [...race.drainEvents(), ...eventsDuring(race, 0.5, input)];

    expect(kick).toContainEqual({ type: "attack-landed", attacker: ME, target: FIRST_COP, kind: "kick" });
    expect(race.snapshot().cops[0].stamina).toBe(126);
  });

  it("makes the cop fight back with its club, swinging it at the rider who hit it about once a second, each hit taking 30 stamina", () => {
    // In a race in which no opponent comes to join the fight.
    const { race, input } = alongsideTheFirstCop(3);
    const cop = () => race.snapshot().cops[0];
    expect(cop()).toMatchObject({ weapon: "club", fightingBack: null });
    // One punch, then the player rides on alongside the cop without hitting it again.
    const punch = eventsUntil(race, () => ({ ...input(), punch: true }), (event) => event.type === "attack-landed", 1);
    expect(punch).toContainEqual({ type: "attack-landed", attacker: ME, target: FIRST_COP, kind: "punch" });
    expect(punch).toContainEqual({ type: "cop-retaliating", cop: 0, target: PLAYER });
    const swings: number[] = [];
    const hits: number[] = [];
    let stamina = player(race).stamina;
    const watching = () => {
      for (const event of race.drainEvents()) {
        if (event.type === "attack-thrown" && event.attacker.kind === "cop") {
          expect(event).toEqual({ type: "attack-thrown", attacker: FIRST_COP, target: ME, kind: "club-swing" });
          swings.push(race.snapshot().clock);
        }
        if (event.type === "attack-landed" && event.attacker.kind === "cop") {
          expect(event).toEqual({ type: "attack-landed", attacker: FIRST_COP, target: ME, kind: "club-swing" });
          hits.push(stamina - player(race).stamina);
        }
      }
      stamina = player(race).stamina;
      return input();
    };

    // Riding on beside it, the player is soon clubbed down and knocked off, and the cop busts them.
    secondsUntil(race, watching, () => player(race).status !== "racing", 15);

    expect(player(race).status).toBe("busted");
    expect(swings.length).toBeGreaterThanOrEqual(4);
    for (const [index, at] of swings.slice(1).entries()) expect(at - swings[index]).toBeCloseTo(1, 1);
    expect(hits.slice(0, 3)).toEqual([30, 30, 30]);
    expect(cop()).toMatchObject({ status: "riding", weapon: "club" });
  });

  it("makes beating a fresh cop costly: a player who mashes punch knocks it off but loses more than half their stamina, and its club stays its own", () => {
    for (const seed of [1, 2, 3]) {
      const { race, input } = alongsideTheFirstCop(seed);
      const punching = () => ({ ...input(), punch: true });

      const events = eventsUntil(race, punching, (event) => event.type === "cop-knocked-off" || event.type === "player-race-over", 15);

      expect(events).toContainEqual(expect.objectContaining({ type: "cop-knocked-off", cop: 0 }));
      expect(events.filter((event) => event.type === "weapon-stolen")).toEqual([]);
      expect(events.filter((event) => event.type === "attack-landed" && event.attacker.kind === "cop").length).toBeGreaterThanOrEqual(2);
      expect(player(race)).toMatchObject({ status: "racing", crash: null, weapon: null });
      expect(player(race).stamina).toBeLessThan(50);
    }
  });

  it("leaves a cop to recover its stamina as a rider does: at 6 per second from 2 s after it was last hit, up to 150", () => {
    const { race, input } = alongsideTheFirstCop(3);
    const stamina = () => race.snapshot().cops[0].stamina;
    eventsUntil(race, () => ({ ...input(), punch: true }), (event) => event.type === "attack-landed", 1);
    expect(stamina()).toBe(132);

    eventsDuring(race, 1.9, input);
    expect(stamina()).toBe(132);
    eventsDuring(race, 1.1, input);
    expect(stamina()).toBeCloseTo(138, 0);
    eventsDuring(race, 3, input);
    expect(stamina()).toBe(150);
  });

  it("knocks a cop with no stamina left off its bike with the next hit, out of the race for good", () => {
    const { race, input } = alongsideTheFirstCop(3);
    const cop = () => race.snapshot().cops[0];
    const punching = () => ({ ...input(), punch: true });
    // Beaten down to no stamina, the cop stays on its bike...
    secondsUntil(race, punching, () => cop().stamina === 0, 20);
    expect(cop()).toMatchObject({ status: "riding", crash: null });
    race.drainEvents();

    // ...until the next hit, which knocks it off at the speed it was riding.
    let speed = NaN;
    const events = eventsUntil(race, () => ((speed = cop().speed), punching()), (event) => event.type === "cop-knocked-off", 3);

    expect(events).toContainEqual({ type: "cop-knocked-off", cop: 0, impactSpeed: expect.closeTo(speed, 0) });
    expect(events).toContainEqual({ type: "cop-gone", cop: 0 });
    expect(cop()).toMatchObject({ status: "knocked-off", crash: "tumbling", near: false });
    // It never gets back on its bike, and nobody can fight it now.
    const later = eventsDuring(race, 20, punching);
    expect(later.filter((event) => JSON.stringify(event).includes('"cop"'))).toEqual([]);
    expect(cop()).toMatchObject({ status: "knocked-off", crash: "on-foot", busting: null, fightingBack: null });
    expect(player(race).status).toBe("racing");
  });
});

describe("the cop alert", () => {
  it("is on while a cop in the race is within 150 m of the player: cop-near as one comes that close at up to 66 m/s, faster than any bike, cop-gone as it leaves", () => {
    const { race, target, input } = alongsideARacer(2);
    const them = () => race.snapshot().riders[target];
    const cop = () => race.snapshot().cops[0];
    const near = new Set<number>();
    const waitingAt = cop().distance;

    // Riding up to the first cop, waiting on the shoulder: no alert yet.
    const before = rideWatchingTheCops(race, input, () => player(race).distance >= waitingAt - 150, 120, near);
    // Beating the racer down on the way, and knocking it off just past the cop as it joins the race, so that it busts
    // the racer and stays with it a while, as the player rides on flat out; then the cop chases the player back down,
    // faster than any bike.
    const punching = () => ({ ...input(), punch: them().stamina > 0 || them().distance - cop().distance > 2 });
    const passing = rideWatchingTheCops(race, punching, () => them().crash !== null, 30, near);
    const ridingOn: RaceEvent[] = [];
    const pilot = autopilot(race);
    let fastest = 0;
    const chased = () => ((fastest = Math.max(fastest, cop().speed)), pilot());
    rideWatchingTheCops(race, chased, () => ridingOn.length >= 2, 90, near, ridingOn);

    expect(before).toEqual([]);
    expect(passing).toEqual([{ type: "cop-near", cop: 0 }]);
    expect(them().status).toBe("busted");
    expect(ridingOn).toEqual([
      { type: "cop-gone", cop: 0 },
      { type: "cop-near", cop: 0 },
    ]);
    expect(fastest).toBeGreaterThan(kmh(225));
    expect(fastest).toBeLessThanOrEqual(66 + 1e-9);
  });
});

describe("busting", () => {
  it("is what a cop does to a rider who crashes close in front of it: it rides to them and catches them before they get back on their bike, once they are on their feet, never while they tumble", () => {
    const { race, target, input, cop, them } = racerKnockedOffJustPastTheFirstCop();
    expect(apart(cop(), them())).toBeLessThan(15);
    expect(cop().busting).toBe(target);
    const crashedAt = race.snapshot().clock;

    const events = eventsUntil(race, input, (event) => event.type === "busted", 10);

    expect(events.at(-1)).toEqual({ type: "busted", rider: target, cop: 0 });
    expect(events).not.toContainEqual({ type: "remounted", rider: target });
    expect(apart(cop(), them())).toBeLessThan(3);
    // Caught as they got to their feet, the tumble over.
    expect(them().crash).toBe("on-foot");
    // At least 1.2 s, to the step: the clock adds up steps, so it can fall a hair short of a whole number of them.
    expect(race.snapshot().clock - crashedAt).toBeGreaterThan(1.2 - 1e-9);
  });

  it("has the cop ride to a crashed rider at an arrest pace: braked down to 8 m/s within 2.5 s of the crash, and no faster after", () => {
    const { race, input, cop, target } = racerKnockedOffAheadOfTheFollowingCop();
    expect(cop().busting).toBe(target);

    const speeds: number[] = [];
    secondsUntil(race, () => (speeds.push(cop().speed), input()), () => cop().busting === null, 20);

    // Braking from at most 66 m/s takes about 2 s; a tenth of a metre per second allows for easing into the pace.
    expect(speeds.length).toBeGreaterThan(2.5 * STEPS_PER_SECOND);
    expect(Math.max(...speeds.slice(2.5 * STEPS_PER_SECOND))).toBeLessThanOrEqual(8.1);
  });

  it("is a race a rider can win: knocked off with the cop following at its usual gap, 1.5 s behind them, they run straight back to their bike and get away", () => {
    const { race, target, input, cop, them, speed, behind } = racerKnockedOffAheadOfTheFollowingCop();
    expect(cop().busting).toBe(target);
    // At V m/s the cop is 1.5 V behind. The rider tumbles about 0.6 V on and runs back at 6 m/s to their bike, which
    // slides about V² / 160 m: back on it within about 3.5 s. The cop needs longer: braking down to 8 m/s takes it
    // under V² / 60 m nearer, and it covers the rest of the 1.5 V at 8 m/s.
    expect(behind).toBeGreaterThanOrEqual(1.4 * speed);

    const events = eventsUntil(race, input, (event) => (event.type === "remounted" && event.rider === target) || event.type === "busted", 15);

    expect(events.at(-1)).toEqual({ type: "remounted", rider: target });
    expect(them()).toMatchObject({ status: "racing", crash: null });
    expect(apart(cop(), them())).toBeGreaterThan(2.5);
  });

  it("lets a rider go who crashes with the cop over 60 m off and runs straight back to their bike: the cop closes in at an arrest pace", () => {
    const { race, target, input } = alongsideARacerPastTheFirstCop(6);
    const cop = () => race.snapshot().cops[0];
    const them = () => race.snapshot().riders[target];
    // Knocked off as the cop, done following the player, falls back past 60 m behind.
    knockOffWhen(race, target, input, () => them().distance - cop().distance > 62);
    expect(apart(cop(), them())).toBeGreaterThan(60);
    expect(apart(cop(), them())).toBeLessThan(80);
    expect(cop().busting).toBe(target);

    const events = eventsUntil(race, input, (event) => event.type === "remounted" && event.rider === target, 10);

    expect(events.filter((event) => event.type === "busted")).toEqual([]);
    expect(them()).toMatchObject({ status: "racing", crash: null });
    // The cop gives up.
    eventsDuring(race, 1, input);
    expect(cop().busting).toBeNull();
    expect(them().status).toBe("racing");
  });

  it("leaves alone a rider who crashes more than 80 m from it: a cop following the player then pulls over until they are back on their bike", () => {
    // Following 1.5 s behind a player riding 54 m/s or more, the cop is over 80 m behind them.
    const { race, cop, speed, behind } = crashedAtSpeedAheadOfTheFollowingCop(5);
    expect(speed).toBeGreaterThanOrEqual(54);
    expect(behind).toBeGreaterThan(80);
    expect(cop().busting).toBeNull();
    const crashedAt = race.snapshot().clock;
    const moving: number[] = [];
    const watching = () => {
      if (race.snapshot().clock - crashedAt > 3 && cop().speed > 0.5) moving.push(cop().speed);
      return NO_INPUT;
    };

    const events = eventsUntil(race, watching, (event) => event.type === "remounted" && event.rider === PLAYER, 20);

    expect(events.filter((event) => event.type === "busted")).toEqual([]);
    expect(race.snapshot().clock - crashedAt).toBeGreaterThan(3);
    // Stopped within 3 s of the crash, it stayed put while they ran back to their bike, and never rode up to them.
    expect(moving).toEqual([]);
    expect(player(race).distance - cop().distance).toBeGreaterThan(10);
  });

  it("ends the player's race as Busted, which the results say", () => {
    // The player hits the first cop and rides on beside it as it fights back, until it knocks them off.
    const { race, input } = alongsideTheFirstCop();
    const events = eventsUntil(race, () => ({ ...input(), punch: race.snapshot().cops[0].stamina === 150 }), (event) => event.type === "player-race-over", 30);

    const aboutThePlayer = events.filter((event) => event.type === "player-race-over" || ("rider" in event && event.rider === PLAYER));
    expect(aboutThePlayer.slice(-3)).toEqual([
      expect.objectContaining({ type: "crash", rider: PLAYER }),
      { type: "busted", rider: PLAYER, cop: 0 },
      { type: "player-race-over", outcome: "busted" },
    ]);
    expect(player(race)).toMatchObject({ status: "busted", position: null });

    const results = race.fastForward();

    expect(results).toMatchObject({ outcome: "busted", position: null, time: null, qualified: false });
    expect(results.standings).toContainEqual({ rider: PLAYER, name: "You", status: "busted", position: null, time: null });
    const firstUnplaced = results.standings.findIndex((standing) => standing.position === null);
    expect(results.standings.slice(firstUnplaced).every((standing) => standing.position === null)).toBe(true);
  });

  it("takes a busted opponent out of the race for good, with no position", () => {
    const { race, target, input, them } = racerKnockedOffJustPastTheFirstCop();
    eventsUntil(race, input, (event) => event.type === "busted", 10);

    expect(them()).toMatchObject({ status: "busted", position: null });
    const positions = race.snapshot().riders.flatMap((rider) => (rider.position === null ? [] : [rider.position]));
    expect(positions.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    const later = eventsDuring(race, 20, input);

    expect(later.filter((event: RaceEvent) => "rider" in event && event.rider === target)).toEqual([]);
    expect(them()).toMatchObject({ status: "busted", position: null });
  });
});

describe("cops", () => {
  it("wait on the shoulder, one about 1.8 km and the other about 4.5 km along the race, with 150 stamina each", () => {
    const race = createRace({ seed: 1 });
    const { roadHalfWidth, shoulderWidth, startDistance } = race.track;

    const { cops } = race.snapshot();

    expect(cops.map((cop) => cop.status)).toEqual(["waiting", "waiting"]);
    expect(cops[0].distance - startDistance).toBeCloseTo(1800, -2);
    expect(cops[1].distance - startDistance).toBeCloseTo(4500, -2);
    for (const cop of cops) {
      expect(Math.abs(cop.offset)).toBeGreaterThan(roadHalfWidth);
      expect(Math.abs(cop.offset)).toBeLessThanOrEqual(roadHalfWidth + shoulderWidth);
      expect(cop).toMatchObject({ speed: 0, stamina: 150, crash: null });
    }
    expect(new Set(cops.map((cop) => cop.name)).size).toBe(2);
  });

  it("stay where they wait until the player passes them, then join the race", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const [first, second] = race.snapshot().cops;
    const stillWaiting = () => {
      expect(race.snapshot().cops).toEqual([first, second]);
      return pilot();
    };

    secondsUntil(race, stillWaiting, () => player(race).distance >= first.distance, 120);

    expect(race.snapshot().cops.map((cop) => cop.status)).toEqual(["riding", "waiting"]);
    eventsDuring(race, 3, pilot);
    expect(race.snapshot().cops[0].distance).toBeGreaterThan(first.distance + 20);
    expect(race.snapshot().cops[1]).toEqual(second);
  });

  it("follow the player for about 30 s, then fall back out of the alert's range and leave them be for a good while", () => {
    // On a closed road, so that nothing happens to keep the cop with the player.
    const race = startedRace(1, CLOSED_ROAD);
    const pilot = autopilot(race);
    const first = race.snapshot().cops[0];
    secondsUntil(race, pilot, () => player(race).distance >= first.distance, 120);
    const near = () => race.snapshot().cops[0].near;

    const following = secondsUntil(race, pilot, () => !near(), 60);
    const away = secondsUntil(race, pilot, () => near() || player(race).status !== "racing", 300);

    expect(following).toBeGreaterThan(30);
    expect(following).toBeLessThan(45);
    expect(away).toBeGreaterThan(45);
  });
});

describe("the cop alert, over a whole race", () => {
  it("is on for well under half the race once the first cop has joined, for a player who rides it without incident", () => {
    const race = startedRace(1, CLOSED_ROAD);
    const pilot = autopilot(race);
    const first = race.snapshot().cops[0];
    secondsUntil(race, pilot, () => player(race).distance >= first.distance, 120);
    let steps = 0;
    let alerted = 0;

    secondsUntil(
      race,
      () => {
        steps++;
        if (race.snapshot().cops.some((cop) => cop.near)) alerted++;
        return pilot();
      },
      () => player(race).status !== "racing",
      300,
    );

    expect(player(race).status).toBe("finished");
    expect(alerted / steps).toBeLessThan(0.45);
  });
});
