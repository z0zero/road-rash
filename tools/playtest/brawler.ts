import type { AttackSnapshot, RiderId, RiderSnapshot, Track } from "@/race";
import { clamp, KICK_SHARE, randomFrom, type Bot } from "./bot";
import { TUNING } from "./race-rules";
import { makeRacer, type Fighting, type Plan, type Situation } from "./racer";

/**
 * The brawler: a player who races as the racer does (racer.ts) but starts fights. It picks the nearest opponent
 * racing on its bike from 6 m behind to 40 m ahead, at 18 m/s or faster, rides up alongside it, 1.3 m to its side,
 * and hits it whenever it is within reach: a kick one time in four, else a punch, or a swing of a club it holds. It
 * takes a club by punching whoever is winding up a swing within its reach, an opponent or a cop. It lets an opponent
 * go once it is off its bike or out of the race, more than 70 m away or slower than 18 m/s, or after 25 s, and never
 * picks a fight with a cop.
 */
export function makeBrawler(track: Track, pace: number, seed: number): Bot {
  const random = randomFrom((seed * 2654435761) >>> 0 || 1);
  let fightingWith: RiderId | null = null;
  /** The step it picked that fight. */
  let since = 0;
  let punches = 0;
  let kicks = 0;
  let swings = 0;
  let stealTries = 0;
  let fights = 0;

  function plan({ steps, cur, me, riders, cops, line, wanted, edge }: Situation): Plan {
    const d = me.distance;
    if (fightingWith !== null) {
      const them = cur.riders[fightingWith];
      const gone =
        them.status !== "racing" ||
        !!them.crash ||
        Math.abs(them.distance - d) > FIGHT_RANGE + 30 ||
        steps - since > FIGHT_SECONDS * 60 ||
        them.speed < MIN_FIGHT_SPEED;
      if (gone) fightingWith = null;
    }
    if (fightingWith === null) {
      let nearest: RiderSnapshot | null = null;
      for (const x of riders) {
        const gap = x.distance - d;
        if (gap < -6 || gap > FIGHT_RANGE) continue;
        if (x.speed < MIN_FIGHT_SPEED) continue;
        if (!nearest || Math.abs(gap) < Math.abs(nearest.distance - d)) nearest = x;
      }
      if (nearest) {
        fightingWith = nearest.id;
        since = steps;
        fights++;
      }
    }
    let target: RiderSnapshot | null = null;
    if (fightingWith !== null) {
      const them = cur.riders[fightingWith];
      target = them;
      const gap = them.distance - d;
      const side = me.offset >= them.offset ? 1 : -1;
      let beside = them.offset + side * 1.3;
      if (Math.abs(beside) > edge) beside = them.offset - side * 1.3;
      line = clamp(beside, -edge, edge);
      if (Math.abs(gap) < 30) wanted = Math.min(wanted, Math.max(MIN_FIGHT_SPEED, them.speed + clamp(gap + 0.2, -6, 6)));
    }
    // Hit whoever is within reach: a try at taking a club first, then the one it fights.
    let punch = false;
    let kick = false;
    if (!me.attack) {
      // A swing's reach with a club, else a punch's, from the race's tuning, as the counter-puncher's.
      const reachAcross = TUNING.attacks[me.weapon === "club" ? "club-swing" : "punch"].reachAcross;
      const inReach = (x: { distance: number; offset: number }) => Math.abs(x.offset - me.offset) <= reachAcross && Math.abs(x.distance - d) <= TUNING.attackReachAlong;
      if (me.weapon !== "club" && [...riders, ...cops].some((x) => windingUpASwing(x.attack) && inReach(x))) {
        punch = true;
        stealTries++;
      }
      if (!punch && target && inReach(target)) {
        if (me.weapon === "club") {
          punch = true;
          swings++;
        } else if (random() < KICK_SHARE) {
          kick = true;
          kicks++;
        } else {
          punch = true;
          punches++;
        }
      }
    }
    return { line, wanted, punch, kick, fightingWith };
  }

  const fighting: Fighting = { plan, stats: () => ({ punches, kicks, swings, stealTries, fights }) };
  return makeRacer(track, pace, fighting);
}

/** It picks a fight with an opponent up to this many metres ahead, and lets it go 30 m further away. */
const FIGHT_RANGE = 40;
/** It lets an opponent go after this many seconds... */
const FIGHT_SECONDS = 25;
/** ...or once the opponent rides slower than this (m/s). It slows to no less to stay alongside one. */
export const MIN_FIGHT_SPEED = 18;

const windingUpASwing = (attack: AttackSnapshot | null) => attack !== null && attack.kind === "club-swing" && attack.stage === "wind-up";
