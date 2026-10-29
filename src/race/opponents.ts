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
