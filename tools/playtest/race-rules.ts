/**
 * The Race module's own rules that the bots ride by, beyond its interface (`@/race`), which is all the game uses:
 * how fast a bend can be ridden (`safeSpeedAt`, with a bot's own limits), how fast steering moves a bike across the
 * road (`maxSidewaysSpeed`), the tuning (how hard a bend pushes a bike out, an attack's reach) and the ground an
 * obstacle covers. A practised player has a feel for each. The bots take them from the race they ride, so a change to
 * one changes how they ride, as it would change a player's riding. Every commit since 1.0.0 has them where they are.
 */
export { footprintOfObstacle } from "@/race/footprint";
export { safeSpeedAt, type BendLimits } from "@/race/opponent-riding";
export { maxSidewaysSpeed } from "@/race/riding";
export { TUNING } from "@/race/tuning";
