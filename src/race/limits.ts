import { TUNING } from "./tuning";

/**
 * The race's limits that the game shows and plays to, so that the HUD, the
 * results, the camera, the speed effects and the sound read them from the
 * race instead of restating them.
 */

/** A bike's top speed, metres per second: 62.5 m/s is 225 km/h. No rider's bike goes faster. */
export const TOP_SPEED: number = TUNING.topSpeed;

/** A fresh rider's stamina: hits lower it to 0, and it recovers up to this again. */
export const FULL_STAMINA: number = TUNING.fullStamina;

/** A bike in perfect condition: every crash lowers it, and at 0 the bike is wrecked. */
export const FULL_CONDITION: number = TUNING.fullCondition;

/** Finishing in this position or better qualifies. */
export const QUALIFYING_POSITION = 3;

/** A cop in the race this many metres from the player or closer is near them: the cop alert is on and the siren sounds. */
export const COP_ALERT_RANGE: number = TUNING.cops.alertRange;
