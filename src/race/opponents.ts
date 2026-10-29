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
}

/** The fourteen opponents, in rider-id order (the player is rider 0, so these are riders 1 to 14). */
export const OPPONENTS: readonly OpponentProfile[] = [
  { name: "Cinder", temperament: "racer" },
  { name: "Barnacle", temperament: "bully" },
  { name: "Sundown Sadie", temperament: "racer" },
  { name: "Undertow", temperament: "brawler" },
  { name: "Gearbox Greta", temperament: "racer" },
  { name: "Moxie", temperament: "brawler" },
  { name: "Brick", temperament: "bully" },
  { name: "Sandpiper", temperament: "racer" },
  { name: "Rooster", temperament: "brawler" },
  { name: "Lowtide Lou", temperament: "racer" },
  { name: "Nails", temperament: "brawler" },
  { name: "Big Tilda", temperament: "bully" },
  { name: "Zigzag", temperament: "racer" },
  { name: "Flotsam", temperament: "brawler" },
];

/** What the player is called wherever riders are listed by name. */
export const PLAYER_NAME = "You";
