import { describe, expect, it } from "vitest";
import { createRace, PLAYER, type PlayerInput, type Race, type RaceEvent, type RiderId } from ".";
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

  it("makes the cop fight back with its club for about 10 s after it was last hit, then let it be", () => {
    // In a race in which no opponent comes to join the fight.
    const { race, input } = alongsideTheFirstCop(3);
    const cop = () => race.snapshot().cops[0];
    expect(cop()).toMatchObject({ weapon: "club", fightingBack: null });
    // One punch, then the player rides on alongside the cop without hitting it again.
    const punch = eventsUntil(race, () => ({ ...input(), punch: true }), (event) => event.type === "attack-landed", 1);
    expect(punch).toContainEqual({ type: "attack-landed", attacker: ME, target: FIRST_COP, kind: "punch" });
    expect(punch).toContainEqual({ type: "cop-retaliating", cop: 0, target: PLAYER });
    const hitAt = race.snapshot().clock;
    const fights: { at: number; event: RaceEvent }[] = [];
    const watching = () => {
      for (const event of race.drainEvents()) {
        if (event.type === "cop-retaliating" || ("attacker" in event && event.attacker.kind === "cop")) {
          fights.push({ at: race.snapshot().clock - hitAt, event });
        }
      }
      return input();
    };

    secondsUntil(race, watching, () => race.snapshot().clock - hitAt >= 9.5, 10);
    expect(cop().fightingBack).toBe(PLAYER);
    secondsUntil(race, watching, () => race.snapshot().clock - hitAt >= 14, 5);

    expect(fights.filter(({ event }) => event.type === "cop-retaliating")).toEqual([]);
    const swings = fights.filter(({ event }) => event.type === "attack-thrown");
    const landed = fights.filter(({ event }) => event.type === "attack-landed");
    for (const { event } of swings) expect(event).toEqual({ type: "attack-thrown", attacker: FIRST_COP, target: ME, kind: "club-swing" });
    expect(swings.length).toBeGreaterThanOrEqual(3);
    expect(landed.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...swings.map(({ at }) => at))).toBeLessThan(10);
    expect(cop().fightingBack).toBeNull();
    expect(player(race)).toMatchObject({ status: "racing", crash: null });
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
  it("is on while a cop in the race is within 150 m of the player: cop-near as one comes that close, cop-gone as it leaves", () => {
    const { race, target, input } = alongsideARacer(2);
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

  it("ends the player's race as Busted, which the results say", () => {
    // The player hits the first cop and rides on beside it as it fights back; a brawler joins in and knocks them off.
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
    // On a closed road, so that no crash in traffic gets the player busted by the first cop on the way to the second.
    const race = startedRace(1, CLOSED_ROAD);
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
