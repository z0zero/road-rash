import { describe, expect, it } from "vitest";
import { createRace, NO_INPUT, PLAYER, STEP_SECONDS, type PlayerInput, type Race, type RaceEvent, type RiderId } from ".";
import { alongsideARacer, autopilot, eventsDuring, eventsUntil, kmh, player, secondsUntil, startedRace } from "./test-helpers";

const ME = { kind: "rider", id: PLAYER } as const;
const FIRST_COP = { kind: "cop", id: 0 } as const;

/** Metres between two things in track space: along the track and across it. */
const apart = (a: { distance: number; offset: number }, b: { distance: number; offset: number }) =>
  Math.hypot(a.distance - b.distance, a.offset - b.offset);

/**
 * A started race in which the player has ridden alongside a racer (an
 * opponent who rarely attacks) until they have just passed the first cop, so
 * that it has joined the race.
 */
function alongsideARacerPastTheFirstCop(seed = 1) {
  const alongside = alongsideARacer(seed);
  const { race, input } = alongside;
  const cop = race.snapshot().cops[0];
  secondsUntil(race, input, () => player(race).distance >= cop.distance, 120);
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
  return eventsUntil(race, punching, (event) => event.type === "crash" && event.rider === target, 30);
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

/**
 * Scripted input that rides the player up alongside the first cop, 1.4 m to
 * its side (towards the middle of the road) and level with it, and holds them
 * there. It closes in on the cop at no more than 5 m/s.
 */
function rideAlongsideTheFirstCop(race: Race) {
  let lastOffset = player(race).offset;
  return (): PlayerInput => {
    const me = player(race);
    const cop = race.snapshot().cops[0];
    const sideways = (me.offset - lastOffset) / STEP_SECONDS;
    lastOffset = me.offset;
    const lane = cop.offset + (cop.offset > 0 ? -1.4 : 1.4);
    const closing = Math.max(-5, Math.min(5, 0.8 * (cop.distance - me.distance)));
    const wanted = Math.max(0, cop.speed + closing);
    return {
      ...NO_INPUT,
      steer: Math.max(-1, Math.min(1, 0.8 * (lane - me.offset) - 0.25 * sideways)),
      throttle: me.speed < wanted ? 1 : 0,
      brake: me.speed > wanted + 0.5 ? Math.min(1, (me.speed - wanted) / 3) : 0,
    };
  };
}

/**
 * A started race in which the player has passed the first cop, so that it has
 * joined the race, and ridden up alongside it: the cop is within the reach of
 * a punch, and nearer the player than any rider.
 */
function alongsideTheFirstCop(seed = 1) {
  const race = startedRace(seed);
  const waitingAt = race.snapshot().cops[0].distance;
  secondsUntil(race, autopilot(race), () => player(race).distance >= waitingAt, 120);
  const input = rideAlongsideTheFirstCop(race);
  const withinReach = () => {
    const { riders, cops } = race.snapshot();
    const me = riders[PLAYER];
    const cop = cops[0];
    const reached = Math.abs(cop.offset - me.offset) <= 1.8 && Math.abs(cop.distance - me.distance) <= 2;
    const nearer = riders.some((rider) => rider.id !== PLAYER && rider.status === "racing" && !rider.crash && apart(rider, me) <= apart(cop, me));
    return reached && !nearer;
  };
  secondsUntil(race, input, withinReach, 30);
  race.drainEvents();
  return { race, input };
}

describe("fighting a cop", () => {
  it("is punching and kicking it like a rider: a cop starts with 150 stamina, and a punch lowers it by 18", () => {
    const { race, input } = alongsideTheFirstCop();
    expect(race.snapshot().cops[0].stamina).toBe(150);

    race.step({ ...input(), punch: true });
    const events = [...race.drainEvents(), ...eventsDuring(race, 0.5, input)];

    expect(events).toContainEqual({ type: "attack-thrown", attacker: ME, target: FIRST_COP, kind: "punch" });
    expect(events).toContainEqual({ type: "attack-landed", attacker: ME, target: FIRST_COP, kind: "punch" });
    expect(race.snapshot().cops[0].stamina).toBe(132);
  });
});

describe("the cop alert", () => {
  it("is on while a cop in the race is within 150 m of the player: cop-near as one comes that close, cop-gone as it leaves", () => {
    const { race, target, input } = alongsideARacer();
    const them = () => race.snapshot().riders[target];
    const cop = () => race.snapshot().cops[0];
    const near = new Set<number>();
    const waitingAt = cop().distance;

    // Passing the first cop, which joins the race.
    const passing = rideWatchingTheCops(race, input, () => player(race).distance >= waitingAt + 20, 120, near);
    // Knocking the racer off with the cop close behind, so that it busts the racer and stays with it a while, as the
    // player rides on flat out; then the cop comes back up to the player.
    const punching = () => ({ ...input(), punch: them().stamina > 0 || them().distance - cop().distance > 5 });
    rideWatchingTheCops(race, punching, () => them().crash !== null, 30, near);
    const ridingOn: RaceEvent[] = [];
    rideWatchingTheCops(race, autopilot(race), () => ridingOn.length >= 2, 90, near, ridingOn);

    expect(passing).toEqual([{ type: "cop-near", cop: 0 }]);
    expect(them().status).toBe("busted");
    expect(ridingOn).toEqual([
      { type: "cop-gone", cop: 0 },
      { type: "cop-near", cop: 0 },
    ]);
  });
});

describe("busting", () => {
  it("is what a cop does to a rider who crashes within 80 m of it, riding to them before they get back on their bike", () => {
    const { race, target, input } = alongsideARacerPastTheFirstCop();
    const cop = () => race.snapshot().cops[0];
    const them = () => race.snapshot().riders[target];
    // Knocked off with the cop close behind.
    knockOffWhen(race, target, input, () => them().distance - cop().distance > 5);
    expect(apart(cop(), them())).toBeLessThan(80);

    const events = eventsUntil(race, input, (event) => event.type === "busted", 10);

    expect(events.at(-1)).toEqual({ type: "busted", rider: target, cop: 0 });
    expect(events).not.toContainEqual({ type: "remounted", rider: target });
    expect(apart(cop(), them())).toBeLessThan(3);
  });

  it("lets a rider go who gets back on their bike before the cop reaches them", () => {
    const { race, target, input } = alongsideARacerPastTheFirstCop();
    const cop = () => race.snapshot().cops[0];
    const them = () => race.snapshot().riders[target];
    // Knocked off with the cop well ahead, so that it has to stop and come back.
    knockOffWhen(race, target, input, () => cop().distance - them().distance > 15);
    expect(apart(cop(), them())).toBeLessThan(80);
    expect(cop().busting).toBe(target);

    const events = eventsUntil(race, input, (event) => event.type === "remounted" && event.rider === target, 10);

    expect(events.filter((event) => event.type === "busted")).toEqual([]);
    expect(them()).toMatchObject({ status: "racing", crash: null });
    // The cop gives up, and rides on near the player.
    eventsDuring(race, 10, input);
    expect(cop().busting).toBeNull();
    expect(apart(cop(), player(race))).toBeLessThan(150);
    expect(them().status).toBe("racing");
  });

  it("takes a busted opponent out of the race for good, with no position", () => {
    const { race, target, input } = alongsideARacerPastTheFirstCop();
    const cop = () => race.snapshot().cops[0];
    const them = () => race.snapshot().riders[target];
    knockOffWhen(race, target, input, () => them().distance - cop().distance > 5);
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

  it("chase down a player who passes them at speed, at up to 66 m/s, faster than any bike, and stay within 150 m of them", () => {
    const race = startedRace();
    const pilot = autopilot(race);
    const second = race.snapshot().cops[1];
    secondsUntil(race, pilot, () => player(race).distance >= second.distance, 300);
    expect(player(race).speed).toBeGreaterThan(40);
    let fastest = 0;
    let furthest = 0;

    eventsDuring(race, 60, () => {
      const { riders, cops } = race.snapshot();
      fastest = Math.max(fastest, cops[1].speed);
      furthest = Math.max(furthest, apart(cops[1], riders[PLAYER]));
      return pilot();
    });

    expect(fastest).toBeGreaterThan(kmh(225));
    expect(fastest).toBeLessThanOrEqual(66 + 1e-9);
    expect(furthest).toBeLessThanOrEqual(150);
  });
});
