import { PLAYER, type RiderId, type RiderSnapshot, type Track } from "@/race";
import { KICK_SHARE, randomFrom, type Bot } from "./bot";
import { TUNING } from "./race-rules";
import { makeRacer } from "./racer";

/**
 * The counter-puncher: a player who rides exactly as the racer does (racer.ts), never starts a fight, but hits back
 * at an opponent whose hit has landed on it in the last 3 seconds while that opponent is within reach: a punch, a
 * kick one time in four, or a swing of a club it holds.
 *
 * It knows who hit it from the race's events, as a player sees a hit land and who threw it. Its reach is the game's:
 * `TUNING.attackReachAlong` along the track, and the attack's `reachAcross` sideways. As a player's does, its attack
 * lands on whoever is nearest within reach when it strikes.
 */
export function makeCounterPuncher(track: Track, pace: number, seed: number): Bot {
  const racer = makeRacer(track, pace);
  // Its own generator for a punch or a kick, so the racer's riding is untouched.
  const random = randomFrom(((seed * 2246822519) ^ 0x5bd1e995) >>> 0 || 1);
  let steps = 0;
  /** The step each opponent's last hit on it landed. */
  const lastHitMe = new Map<RiderId, number>();
  const attackers = new Set<RiderId>();
  let counters = 0;
  let punches = 0;
  let kicks = 0;
  let swings = 0;
  let hitsOnMe = 0;

  return {
    decide(prev, cur) {
      steps++;
      const input = racer.decide(prev, cur);
      const me = cur.riders[PLAYER];
      if (me.status !== "racing" || cur.countdown > 0 || me.crash || me.attack) return input;
      const kind = me.weapon === "club" ? "club-swing" : "punch";
      const inReach = (x: RiderSnapshot) =>
        Math.abs(x.offset - me.offset) <= TUNING.attacks[kind].reachAcross && Math.abs(x.distance - me.distance) <= TUNING.attackReachAlong;
      const target = cur.riders.find((x) => {
        if (x.id === PLAYER || x.status !== "racing" || x.crash) return false;
        const at = lastHitMe.get(x.id);
        return at !== undefined && steps - at <= MEMORY_SECONDS * 60 && inReach(x);
      });
      if (!target) return input;
      counters++;
      if (me.weapon === "club") {
        swings++;
        return { ...input, punch: true, kick: false };
      }
      if (random() < KICK_SHARE) {
        kicks++;
        return { ...input, punch: false, kick: true };
      }
      punches++;
      return { ...input, punch: true, kick: false };
    },
    hear(events) {
      for (const e of events) {
        if (e.type === "attack-landed" && e.target.kind === "rider" && e.target.id === PLAYER && e.attacker.kind === "rider") {
          lastHitMe.set(e.attacker.id, steps);
          hitsOnMe++;
          attackers.add(e.attacker.id);
        }
      }
    },
    stats: () => ({ counters, punches, kicks, swings, hitsOnMe, attackers: attackers.size }),
  };
}

/** How long it remembers a hit on it, in seconds. */
const MEMORY_SECONDS = 3;
