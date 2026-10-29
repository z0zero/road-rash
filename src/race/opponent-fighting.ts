import type { AttackKind } from "./events";
import { RACING, type Intent } from "./opponent-riding";
import type { Temperament } from "./opponents";
import type { Random } from "./random";
import type { Motion } from "./riding";
import { STEP_SECONDS } from "./steps";

/** Brawlers and bullies ride up alongside the player to fight them when the player is within this many metres along the track... */
const PICK_A_FIGHT_RANGE = 35;
/** ...and riding faster than this (m/s), so a player who has just got back on their bike gets going first... */
const PICK_A_FIGHT_SPEED = 15;
/** ...riding this much harder than their usual pace to keep up with them. */
const FIGHTING_PACE = 1.1;

/** An opponent with less stamina than this is badly beaten: it drops back... */
const BADLY_BEATEN = 30;
/** ...until it has recovered this much... */
const RECOVERED = 80;
/** ...riding at this share of its usual pace. */
const DROP_BACK_PACE = 0.8;

/** Whether an opponent with this much stamina is dropping back, given whether it was a step ago. */
export function isDroppingBack(wasDroppingBack: boolean, stamina: number): boolean {
  return wasDroppingBack ? stamina < RECOVERED : stamina < BADLY_BEATEN;
}

/**
 * What an opponent of a temperament is up to: a badly beaten one drops back,
 * easing off, until it has recovered; otherwise brawlers and bullies pick a
 * fight with the player nearby, riding up alongside them, and racers just
 * race. `player` is the player's motion while they race on their bike, else
 * null.
 */
export function opponentIntent(
  temperament: Temperament,
  me: Readonly<Motion>,
  player: Readonly<Motion> | null,
  droppingBack: boolean,
): Intent {
  if (droppingBack) return { alongside: null, paceShare: DROP_BACK_PACE };
  if (temperament === "racer" || !player) return RACING;
  if (Math.abs(player.distance - me.distance) > PICK_A_FIGHT_RANGE || player.speed < PICK_A_FIGHT_SPEED) return RACING;
  return { alongside: player, paceShare: FIGHTING_PACE };
}

/** How many times a second an opponent of each temperament attacks the player when the player is within its reach... */
const ATTACKS_PER_SECOND: Record<Temperament, number> = { racer: 0.1, brawler: 1.8, bully: 1.8 };
/** ...and, as a share of that, another opponent within its reach. */
const AT_EACH_OTHER = 0.1;
/** The share of opponents' attacks that are kicks rather than punches. */
const KICKS = 0.3;

/**
 * Whether an opponent of a temperament attacks this step, and with what,
 * when the nearest rider within its reach is the player (`atThePlayer`) or
 * another opponent.
 */
export function opponentAttack(temperament: Temperament, atThePlayer: boolean, random: Random): AttackKind | null {
  const rate = ATTACKS_PER_SECOND[temperament] * (atThePlayer ? 1 : AT_EACH_OTHER);
  if (!random.chance(rate * STEP_SECONDS)) return null;
  return random.chance(KICKS) ? "kick" : "punch";
}
