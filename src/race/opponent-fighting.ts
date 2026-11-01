import type { DifficultyTuning } from "./difficulty";
import type { AttackKind } from "./events";
import { RACING, type Intent } from "./opponent-riding";
import type { Temperament } from "./opponents";
import type { Random } from "./random";
import type { Motion } from "./riding";
import { STEP_SECONDS, stepsIn } from "./steps";

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

/** A brawler or bully rides alongside a player slower than this share of its own pace where it is (see `paceAt`)... */
const SLOW_PLAYER = 0.85;
/**
 * ...for at most this many steps, then gives up on them and races on; it
 * picks a fight with them again only once they have ridden at least that fast
 * for as long.
 */
const PATIENCE_STEPS = stepsIn(10);

/** How long a brawler or bully will still ride alongside a slow player, and whether it has given up on them. */
export interface Patience {
  /** Steps it will still ride alongside a slow player. */
  steps: number;
  /** Whether it has given up on the player: it just races, and attacks them only if they hit it, until its patience is whole again. */
  gaveUp: boolean;
  /** How many of its hits have landed on the player, one after another, while they didn't fight it back. */
  unansweredHits: number;
}

/** An opponent's patience with the player at the start of the race: whole. */
export function wholePatience(): Patience {
  return { steps: PATIENCE_STEPS, gaveUp: false, unansweredHits: 0 };
}

/**
 * Moves an opponent's patience with the player on by a step. It wears thin
 * while the opponent rides up alongside the player (`alongside`) and the
 * player rides slower than `SLOW_PLAYER` of the opponent's own pace where it
 * is (`pace`, m/s), and once it runs out the opponent gives up on them. It
 * builds back up while the player rides at least that fast, and once it is
 * whole again the opponent no longer has given up on them. `playerSpeed` is
 * null while the player isn't riding.
 */
export function wearPatience(patience: Patience, alongside: boolean, playerSpeed: number | null, pace: number): void {
  if (playerSpeed === null) return;
  const slow = playerSpeed < SLOW_PLAYER * pace;
  if (slow && alongside) patience.steps = Math.max(0, patience.steps - 1);
  else if (!slow) patience.steps = Math.min(PATIENCE_STEPS, patience.steps + 1);
  if (patience.steps === 0) patience.gaveUp = true;
  else if (patience.steps === PATIENCE_STEPS) patience.gaveUp = false;
}

/**
 * What an opponent of a temperament is up to: a badly beaten one drops back,
 * easing off, until it has recovered; otherwise brawlers and bullies pick a
 * fight with the player nearby, riding up alongside them, unless they have
 * given up on a slow player (`gaveUp`, see `wearPatience`), and racers just
 * race. `player` is the player's motion while they race on their bike, else
 * null.
 */
export function opponentIntent(
  temperament: Temperament,
  me: Readonly<Motion>,
  player: Readonly<Motion> | null,
  droppingBack: boolean,
  gaveUp = false,
): Intent {
  if (droppingBack) return { alongside: null, paceShare: DROP_BACK_PACE };
  if (temperament === "racer" || !player || gaveUp) return RACING;
  if (Math.abs(player.distance - me.distance) > PICK_A_FIGHT_RANGE || player.speed < PICK_A_FIGHT_SPEED) return RACING;
  return { alongside: player, paceShare: FIGHTING_PACE };
}

/**
 * Brawlers and bullies take turns at fighting the player: one that wants to
 * while another has its turn waits its turn this many metres behind them...
 */
const WAITING_GAP = 8;

/**
 * What a brawler or bully that wants to fight the player does while another
 * has its turn: behind the player, it waits its turn `WAITING_GAP` behind
 * them, riding at its fighting pace to keep up; level with them or ahead, it
 * just races, so it never slows down in their way.
 */
export function waitingIntent(me: Readonly<Motion>, player: Readonly<Motion>): Intent {
  if (me.distance >= player.distance) return RACING;
  return { alongside: { ...player, distance: player.distance - WAITING_GAP }, paceShare: FIGHTING_PACE };
}

/**
 * Whose turn it is to fight the player, of the brawlers and bullies that want
 * to (`wanting`): the one whose turn it is already (`current`) for as long as
 * it wants to, or else the one nearest the player along the track; nobody if
 * none wants to.
 */
export function whoseTurn<T extends { readonly motion: Readonly<Motion> }>(
  current: T | null,
  wanting: readonly T[],
  player: Readonly<Motion>,
): T | null {
  if (current && wanting.includes(current)) return current;
  let nearest: T | null = null;
  for (const rider of wanting) {
    const gap = Math.abs(rider.motion.distance - player.distance);
    if (!nearest || gap < Math.abs(nearest.motion.distance - player.distance)) nearest = rider;
  }
  return nearest;
}

/**
 * The player is fighting an opponent back while they have hit it within this
 * many steps. Once an opponent's hit lands on a player who isn't, it gives
 * them a breather (the difficulty's) before attacking them again, and on some
 * difficulties on a player who is, too.
 */
const FIGHTING_BACK_STEPS = stepsIn(5);

/** Whether the player is fighting back against an opponent they last hit `stepsSinceThePlayerHitIt` steps ago. */
export function isFightingBack(stepsSinceThePlayerHitIt: number): boolean {
  return stepsSinceThePlayerHitIt <= FIGHTING_BACK_STEPS;
}

/** An opponent whose hit has just landed on the player, and how it stands with them. */
interface HittingThePlayer {
  breatherSteps: number;
  readonly stepsSinceThePlayerHitIt: number;
  readonly patience: Patience;
}

/**
 * What an opponent whose hit has just landed on the player does about it: it
 * gives them a breather before it attacks them again, unless they are
 * fighting it back on a difficulty that gives no breather then, where a brawl
 * is a brawl; and once as many of its hits as the difficulty allows
 * (`difficultyTuning`) have landed on them unanswered, it loses its patience
 * with them and gives up on them.
 */
export function afterHittingThePlayer(opponent: HittingThePlayer, difficultyTuning: DifficultyTuning): void {
  const foughtBack = isFightingBack(opponent.stepsSinceThePlayerHitIt);
  opponent.breatherSteps = foughtBack && !difficultyTuning.breatherWhenFoughtBack ? 0 : stepsIn(difficultyTuning.breatherSeconds);
  if (foughtBack) return;
  opponent.patience.unansweredHits++;
  if (opponent.patience.unansweredHits < difficultyTuning.unansweredHits) return;
  opponent.patience.unansweredHits = 0;
  opponent.patience.steps = 0;
  opponent.patience.gaveUp = true;
}

/**
 * How many times a second an opponent of each temperament attacks the player
 * when the player is within its reach and it is free to, on Normal (the
 * difficulty makes it more or less often). A bully attacks less readily than
 * a brawler, as its club hits hard and is ready again almost as it strikes:
 * about once every 1.2 s, where a brawler attacks about once a second...
 */
const ATTACKS_PER_SECOND: Record<Temperament, number> = { racer: 0.1, brawler: 1.8, bully: 1.3 };
/** ...and, as a share of that, another opponent within its reach... */
const AT_EACH_OTHER = 0.1;
/**
 * ...and, as a further share, a rider winding up a club swing: a hit thrown
 * then would take their club, but few dare to throw one into a swing.
 */
const INTO_A_SWING = 0.05;
/** The share of opponents' attacks that are kicks rather than punches. */
const KICKS = 0.3;

/**
 * Whether an opponent of a temperament attacks this step, and with what,
 * when the nearest rider within its reach is the player (`atThePlayer`) or
 * another opponent, and whether that rider is winding up a club swing
 * (`intoASwing`). The difficulty (`difficultyTuning`) says how often it
 * attacks the player.
 */
export function opponentAttack(
  temperament: Temperament,
  atThePlayer: boolean,
  intoASwing: boolean,
  difficultyTuning: DifficultyTuning,
  random: Random,
): AttackKind | null {
  const rate = ATTACKS_PER_SECOND[temperament] * (atThePlayer ? difficultyTuning.attacks : AT_EACH_OTHER) * (intoASwing ? INTO_A_SWING : 1);
  if (!random.chance(rate * STEP_SECONDS)) return null;
  return random.chance(KICKS) ? "kick" : "punch";
}
