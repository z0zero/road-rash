import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRace, PLAYER, type CrashCause, type Difficulty, type RaceOutcome, type RaceSnapshot } from "@/race";
import { makeRacer, RIDER_MARGIN } from "./racer";

/**
 * The cut-in measure, for the release notes' known limitation that an opponent pulling out round a car, or back to
 * its line, doesn't look behind it: the racer rides at full pace (1.0), and every run-in of it with an opponent is
 * classified by who moved across into whom in the half second before it. A *strict cut-across* is one where, half a
 * second before, the racer's line cleared the opponent's bike by 0.8 m or more between their middles, and in that half
 * second the opponent moved across towards the racer by at least 0.25 m, and by more than the racer moved towards it.
 *
 * Its log has a JSON line a run-in, a RACE line a race and a SUMMARY line, which it also returns. It is written to
 * `file`.part and moved to `file` once complete. `onRace` hears of each race as it ends.
 */
export function measureCutIns(
  { difficulty, first, last }: { difficulty: Difficulty; first: number; last: number },
  file: string,
  onRace: (seed: number, outcome: RaceOutcome | null) => void = () => {},
): string {
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.part`;
  writeFileSync(part, "");
  const runIns: RunIn[] = [];
  const races: { seed: number; over: RaceOutcome | null; pos: number | null }[] = [];
  for (let seed = first; seed <= last; seed++) {
    const race = createRace({ seed, difficulty });
    const bot = makeRacer(race.track, PACE);
    let prev = race.snapshot();
    let cur = prev;
    /** The last 30 snapshots before the latest: half a second. */
    const past: RaceSnapshot[] = [];
    let over: RaceOutcome | null = null;
    let pos: number | null = null;
    let steps = 0;
    const myCrashes: { t: number; cause: CrashCause; v: number }[] = [];
    let runInsHere = 0;
    while (!over && steps < 420 * 60) {
      race.step(bot.decide(prev, cur));
      prev = cur;
      cur = race.snapshot();
      const events = race.drainEvents();
      steps++;
      past.push(prev);
      if (past.length > 30) past.shift();
      for (const e of events) {
        if (e.type === "player-race-over") {
          over = e.outcome;
          pos = cur.riders[PLAYER].position;
        }
        if (e.type !== "crash" || e.rider !== PLAYER) continue;
        myCrashes.push({ t: +cur.clock.toFixed(1), cause: e.cause, v: Math.round(e.impactSpeed * 3.6) });
        if (e.cause !== "rider") continue;
        runInsHere++;
        // Who it ran into: the nearest opponent racing on its bike just before the step; and where both were half a
        // second before.
        const me = prev.riders[PLAYER];
        const them = prev.riders
          .filter((r) => r.id !== PLAYER && r.status === "racing" && !r.crash)
          .sort((a, b) => Math.hypot(a.distance - me.distance, a.offset - me.offset) - Math.hypot(b.distance - me.distance, b.offset - me.offset))[0];
        if (!them) throw new Error(`seed ${seed}: a run-in at ${cur.clock} s with no opponent on its bike`);
        const old = past[0];
        const themOld = old.riders[them.id];
        const meOld = old.riders[PLAYER];
        const dt = past.length / 60;
        const theirLat = (them.offset - themOld.offset) / dt;
        const myLat = (me.offset - meOld.offset) / dt;
        const side = Math.sign(me.offset - them.offset) || 1;
        const towardsMe = theirLat * side > 0.3;
        const meTowards = -myLat * side > 0.3;
        const who =
          towardsMe && !meTowards
            ? "they moved across into me"
            : meTowards && !towardsMe
              ? "I moved across into them"
              : towardsMe && meTowards
                ? "both moved across"
                : "neither moved across much (rear-end)";
        const gapThen = (meOld.offset - themOld.offset) * side;
        const theirMove = (them.offset - themOld.offset) * side;
        const myMove = -(me.offset - meOld.offset) * side;
        const cutAcross = gapThen >= 0.8 && theirMove >= 0.25 && theirMove > myMove;
        const swerve = theirMove >= 0.5 && myMove <= 0.15;
        const carNear =
          old.traffic
            .filter((c) => c.distance - themOld.distance > -5 && c.distance - themOld.distance < 50 && Math.abs(c.offset - themOld.offset) < 2.6)
            .sort((a, b) => a.distance - b.distance)
            .map((c) => `${c.oncoming ? "oncoming " : ""}${c.kind} ${r2(c.distance - themOld.distance)} m ahead at ${r2(c.offset)}`)[0] ?? null;
        const runIn: RunIn = {
          seed,
          t: +cur.clock.toFixed(1),
          them: them.name,
          temp: them.temperament,
          ahead: r2(them.distance - me.distance),
          aheadThen: r2(themOld.distance - meOld.distance),
          myKmh: Math.round(me.speed * 3.6),
          theirKmh: Math.round(them.speed * 3.6),
          gapAcross: r2(me.offset - them.offset),
          gapThen: r2(gapThen),
          theirLat: r2(theirLat),
          myLat: r2(myLat),
          theirMove: r2(theirMove),
          myMove: r2(myMove),
          who,
          cutAcross,
          swerve,
          carNear,
        };
        runIns.push(runIn);
        appendFileSync(part, JSON.stringify(runIn) + "\n");
      }
    }
    const raceLine = { seed, over, pos, runIns: runInsHere, myCrashes };
    races.push(raceLine);
    appendFileSync(part, "RACE " + JSON.stringify(raceLine) + "\n");
    onRace(seed, over);
  }
  const by: Record<string, number> = {};
  for (const r of runIns) by[r.who] = (by[r.who] ?? 0) + 1;
  const n = last - first + 1;
  const cut = runIns.filter((r) => r.cutAcross).length;
  const swerves = runIns.filter((r) => r.swerve).length;
  const qualified = races.filter((r) => r.over === "finished" && r.pos !== null && r.pos <= 3).length;
  const summary =
    `SUMMARY ${difficulty} pace ${PACE} riderMargin ${RIDER_MARGIN} seeds ${first}-${last}: ${runIns.length} run-ins in ${n} races (${(runIns.length / n).toFixed(2)} a race); ` +
    `${JSON.stringify(by)}; strict cut-across ${cut} (${(cut / n).toFixed(2)} a race); swerve ${swerves} (${(swerves / n).toFixed(2)} a race); ` +
    `mean closing ${(runIns.reduce((a, r) => a + r.myKmh - r.theirKmh, 0) / Math.max(1, runIns.length)).toFixed(0)} km/h; qualified ${qualified} of ${n}`;
  appendFileSync(part, summary + "\n");
  renameSync(part, file);
  return summary;
}

/** Full pace. */
const PACE = 1;

const r2 = (x: number) => Math.round(x * 100) / 100;

/** A run-in of the racer with an opponent, as its line in the log gives it: speeds in km/h, the rest in metres. */
export interface RunIn {
  readonly seed: number;
  readonly t: number;
  readonly them: string;
  readonly temp: string | null;
  /** How far ahead of the racer the opponent was just before, and half a second before. */
  readonly ahead: number;
  readonly aheadThen: number;
  readonly myKmh: number;
  readonly theirKmh: number;
  readonly gapAcross: number;
  readonly gapThen: number;
  readonly theirLat: number;
  readonly myLat: number;
  readonly theirMove: number;
  readonly myMove: number;
  readonly who: string;
  /** A strict cut-across (see `measureCutIns`). */
  readonly cutAcross: boolean;
  /** The opponent moved 0.5 m or more towards the racer, which moved 0.15 m or less towards it. */
  readonly swerve: boolean;
  /** The car nearest ahead of the opponent in its path half a second before, if any. */
  readonly carNear: string | null;
}
