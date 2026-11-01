import { copsInTheRace, type RaceState } from "./race-state";
import { isPlayer, whereIs, type Rider } from "./riders";
import { stepsIn } from "./steps";
import { apart } from "./track";
import { TUNING } from "./tuning";

/**
 * Every cop in the race within busting range of a rider who has just
 * crashed rides to them, unless it is busting someone already.
 */
export function sendCopsTo(race: RaceState, rider: Rider) {
  for (const cop of copsInTheRace(race)) {
    if (cop.busting === null && apart(cop.motion, whereIs(rider)) <= TUNING.cops.bustingRange) cop.busting = rider.id;
  }
}

/** Cops stop riding to crashed riders who are back on their bikes, or whose race is over: they got away. */
export function letGo(race: RaceState) {
  for (const cop of race.cops) {
    const rider = cop.busting === null ? null : race.riders[cop.busting];
    if (rider && (rider.status !== "racing" || !rider.crash)) cop.busting = null;
  }
}

/**
 * A cop that has reached the crashed rider it was riding to busts them,
 * ending their race, once they are on their feet: never while they tumble,
 * and only at its arrest pace or slower. One still braking down to it, gently
 * with a rider coming up behind it, rides on by and comes back for them.
 */
export function bustRidersReached(race: RaceState) {
  for (const cop of race.cops) {
    const rider = cop.busting === null ? null : race.riders[cop.busting];
    if (rider?.crash?.phase !== "on-foot" || rider.status !== "racing") continue;
    if (apart(cop.motion, whereIs(rider)) > TUNING.cops.bustingReach || cop.motion.speed > TUNING.cops.arrestPace) continue;
    rider.status = "busted";
    cop.busting = null;
    cop.standingBySteps = stepsIn(TUNING.cops.standingBySeconds);
    race.events.push({ type: "busted", rider: rider.id, cop: cop.id });
    if (isPlayer(rider)) {
      race.playerBustedBy = cop;
      race.events.push({ type: "player-race-over", outcome: "busted" });
    }
  }
}
