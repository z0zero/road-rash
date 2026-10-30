import { isMidSwing, nearestWithinReach, punchOf, targetsFor, throwAttack, withinReach } from "./fighting";
import { footprintOfACopsBike, type Footprint } from "./footprint";
import {
  isDroppingBack,
  isFightingBack,
  opponentAttack,
  opponentIntent,
  waitingIntent,
  wearPatience,
  whoseTurn,
} from "./opponent-fighting";
import { catchUpFor, opponentControls, paceAt, type Intent } from "./opponent-riding";
import type { RaceState } from "./race-state";
import { isPlayer, PLAYER, whereIs, type Rider } from "./riders";
import type { Controls, Motion } from "./riding";

/**
 * How an opponent races and fights: racers concentrate on racing and rarely
 * attack, brawlers attack often, and bullies attack often and start the race
 * with a weapon.
 */
export type Temperament = "racer" | "brawler" | "bully";

/** Who an opponent is: the same in every race. */
export interface OpponentProfile {
  /** An original nickname, shown on the HUD and in the results. */
  readonly name: string;
  readonly temperament: Temperament;
  /** 0 (the least skilled) to 1 (the most): how close to the limit the opponent rides. */
  readonly skill: number;
}

/**
 * The fourteen opponents, in rider-id order (the player is rider 0, so these
 * are riders 1 to 14). Racers are the most skilled riders, since riding is all
 * they do; bullies the least.
 */
export const OPPONENTS: readonly OpponentProfile[] = [
  { name: "Cinder", temperament: "racer", skill: 1 },
  { name: "Barnacle", temperament: "bully", skill: 0.35 },
  { name: "Sundown Sadie", temperament: "racer", skill: 0.9 },
  { name: "Undertow", temperament: "brawler", skill: 0.6 },
  { name: "Gearbox Greta", temperament: "racer", skill: 0.8 },
  { name: "Moxie", temperament: "brawler", skill: 0.5 },
  { name: "Brick", temperament: "bully", skill: 0.1 },
  { name: "Sandpiper", temperament: "racer", skill: 0.75 },
  { name: "Rooster", temperament: "brawler", skill: 0.4 },
  { name: "Lowtide Lou", temperament: "racer", skill: 0.65 },
  { name: "Nails", temperament: "brawler", skill: 0.45 },
  { name: "Big Tilda", temperament: "bully", skill: 0.2 },
  { name: "Zigzag", temperament: "racer", skill: 0.55 },
  { name: "Flotsam", temperament: "brawler", skill: 0.3 },
];

/** What the player is called wherever riders are listed by name. */
export const PLAYER_NAME = "You";

/** What the opponents on their bikes decide to do this step. */
export interface OpponentsDecisions {
  /** The controls that ride each opponent on its bike where it wants to go. */
  readonly controls: ReadonlyMap<Rider, Controls>;
  /** The brawlers and bullies waiting their turn to fight the player. */
  readonly waiting: ReadonlySet<Rider>;
}

/**
 * What the opponents among the riders on their bikes (`riding`) decide to do
 * this step, from where things stand: a badly beaten one drops back;
 * brawlers and bullies ride up alongside the player to fight them, one at a
 * time, the others waiting their turn, and lose patience with a player who
 * rides slowly beside them; and every opponent rides at its pace, with
 * catch-up, finding its way around everyone on a bike (`everyoneOnABike`)
 * and the cars and obstacles on the road, and seeing the cops' bikes as it
 * sees a car. It also moves every rider's breather from the player on by a
 * step.
 */
export function decideOpponents(
  race: RaceState,
  riding: readonly Rider[],
  everyoneOnABike: readonly Readonly<Motion>[],
  carsAndObstacles: readonly Footprint[],
): OpponentsDecisions {
  const { riders, cops, track } = race;
  const player = riders[PLAYER];
  // Catch-up keeps the field near the player, so it stops once the player's race is over.
  const catchUp = (rider: Rider) =>
    player.status === "racing" ? catchUpFor(rider.motion.distance - whereIs(player).distance, race.difficulty.catchUp) : 1;
  const playerToFight = player.status === "racing" && !player.crash ? player.motion : null;
  for (const rider of riders) {
    rider.stepsSinceThePlayerHitIt++;
    rider.breatherSteps = Math.max(0, rider.breatherSteps - 1);
  }
  // What each opponent is up to: brawlers and bullies lose patience with a player who rides slowly beside them.
  const intents = new Map<Rider, Intent>();
  for (const rider of riding) {
    if (isPlayer(rider)) continue;
    rider.droppingBack = isDroppingBack(rider.droppingBack, rider.stamina);
    const intent = opponentIntent(rider.temperament, rider.motion, playerToFight, rider.droppingBack, rider.patience.gaveUp);
    wearPatience(rider.patience, intent.alongside !== null, playerToFight?.speed ?? null, paceAt(rider.motion, rider.riding, track));
    intents.set(rider, intent);
  }
  // Brawlers and bullies take turns at the player: any that want to fight them while another has its turn wait theirs.
  const wanting = playerToFight ? riding.filter((rider) => intents.get(rider)?.alongside === playerToFight) : [];
  race.playersFighter = playerToFight ? whoseTurn(race.playersFighter, wanting, playerToFight) : null;
  const waiting = new Set(wanting.filter((rider) => rider !== race.playersFighter));
  for (const rider of waiting) if (playerToFight) intents.set(rider, waitingIntent(rider.motion, playerToFight));
  // Opponents see the cops' bikes, riding or waiting on the shoulder, as they see a car: they slow down in time for
  // a slower one in their path, pulling out to join the race or riding to a crash, and ride round it.
  const forTheOpponents = [
    ...carsAndObstacles,
    ...cops.filter((cop) => cop.status !== "knocked-off").map((cop) => footprintOfACopsBike(cop.motion)),
  ];
  const controls = new Map<Rider, Controls>();
  for (const rider of riding) {
    const intent = intents.get(rider);
    if (isPlayer(rider) || !intent) continue;
    controls.set(rider, opponentControls(rider.motion, rider.riding, track, everyoneOnABike, catchUp(rider), intent, forTheOpponents));
  }
  return { controls, waiting };
}

/**
 * Brawlers, bullies and racers among the riders on their bikes (`riding`)
 * attack the nearest rider within their reach now and then, the player far
 * more often than each other; never a cop. A player who doesn't fight an
 * opponent back gets a breather after each of its hits, and is spared by
 * those `waiting` their turn and those that have given up on them.
 */
export function opponentsAttack(race: RaceState, riding: readonly Rider[], waiting: ReadonlySet<Rider>): void {
  for (const opponent of riding) {
    if (isPlayer(opponent) || opponent.attack || opponent.droppingBack) continue;
    const nearest = nearestWithinReach(opponent.motion, targetsFor(race, opponent), punchOf(opponent));
    // Opponents leave the cops alone.
    if (nearest?.kind !== "rider") continue;
    // A player who doesn't fight an opponent back gets a breather after each of its hits, and is spared by those
    // waiting their turn and those that have given up on them.
    const spared = opponent.breatherSteps > 0 || waiting.has(opponent) || opponent.patience.gaveUp;
    if (isPlayer(nearest) && spared && !isFightingBack(opponent.stepsSinceThePlayerHitIt)) continue;
    const kind = opponentAttack(opponent.temperament, isPlayer(nearest), isMidSwing(nearest.attack), race.difficulty, race.random);
    // A club reaches further than a kick: a club holder swings at a rider its kick can't reach.
    if (kind) throwAttack(race, opponent, kind === "kick" && !withinReach(opponent.motion, nearest.motion, kind) ? "punch" : kind);
  }
}
