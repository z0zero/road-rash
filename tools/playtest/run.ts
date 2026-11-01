import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createRace,
  PLAYER,
  type CopId,
  type CrashCause,
  type Difficulty,
  type RaceEvent,
  type RaceOutcome,
  type RaceResults,
  type RaceSnapshot,
  type RiderId,
  type RiderOrCop,
  type Temperament,
  type Track,
} from "@/race";
import type { Bot, BotName } from "./bot";
import { makeBrawler, MIN_FIGHT_SPEED } from "./brawler";
import { makeCounterPuncher } from "./counter-puncher";
import { makeRacer } from "./racer";

/**
 * A run: a bot rides one race on each seed from `first` to `last` at a difficulty, and its log gets a row a race
 * (`RaceRow`) as each ends, then a SUMMARY line. `pace` is the pace as typed, which the log's name and SUMMARY give
 * as it is. The log is written to `file`.part and moved to `file` once complete. `onRace` hears of each race.
 */
export function run(
  { bot, pace, difficulty, first, last }: RunOptions,
  file: string,
  onRace: (row: RaceRow) => void = () => {},
): RunSummary {
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.part`;
  writeFileSync(part, "");
  const rows: RaceRow[] = [];
  for (let seed = first; seed <= last; seed++) {
    const row = rideRace(bot, Number(pace), difficulty, seed);
    rows.push(row);
    appendFileSync(part, JSON.stringify(row) + "\n");
    onRace(row);
  }
  const summary = summaryOf(rows, bot, settingsOf(bot, pace), JSON.stringify({ difficulty }));
  appendFileSync(part, "SUMMARY " + JSON.stringify(summary) + "\n");
  renameSync(part, file);
  return summary;
}

export interface RunOptions {
  readonly bot: BotName;
  /** As typed: "1.0" names the log racer-1.0.log. */
  readonly pace: string;
  readonly difficulty: Difficulty;
  readonly first: number;
  readonly last: number;
}

/** A bot's settings as the SUMMARY's `cfg` gives them, as the play-tests' runs wrote them: the pace as typed. */
export function settingsOf(bot: BotName, pace: string) {
  return bot === "brawler" ? `{"pace":${pace},"minFightSpeed":${MIN_FIGHT_SPEED}}` : `{"pace":${pace}}`;
}

/** The bot `name` for a race on `track`, riding at `pace`; `seed` starts its own random choices. */
export function makeBot(name: BotName, track: Track, pace: number, seed: number): Bot {
  switch (name) {
    case "racer":
      return makeRacer(track, pace);
    case "counter":
      return makeCounterPuncher(track, pace, seed);
    case "brawler":
      return makeBrawler(track, pace, seed);
  }
}

/** The player's race ends at this step if it hasn't by then: 7 minutes, the countdown's 3 s too. */
const CAP_STEPS = 420 * 60;
const STEPS_PER_SECOND = 60;
/** A stretch of road curving more than this (1/m) is a bend. */
const BEND = 0.006;
/** A fight between the player and an opponent is over once neither has landed a hit on the other for this many seconds. */
const FIGHT_GAP_SECONDS = 5;

/**
 * One race: `bot` rides the player's bike until their race is over, or for 7 minutes, then the rest of the field is
 * raced to the finish a step at a time, as `fastForward` does, and watched.
 */
function rideRace(botName: BotName, pace: number, difficulty: Difficulty, seed: number): RaceRow {
  const race = createRace({ seed, difficulty });
  const track = race.track;
  const half = track.roadHalfWidth;
  const bot = makeBot(botName, track, pace, seed);
  let prev = race.snapshot();
  let cur = prev;
  let steps = 0;
  let over: RaceOutcome | null = null;

  // The player's race.
  const crashes: Record<CrashCause, number> = { "knocked-off": 0, rider: 0, traffic: 0, obstacle: 0, cop: 0 };
  let knockedDown = 0;
  const opp: OpponentCounts = { "knocked-off": 0, rider: 0, traffic: 0, obstacle: 0, cop: 0, busted: 0, wrecked: 0 };
  /** The fights under way, by opponent. */
  const open = new Map<RiderId, Fight>();
  const fights: { readonly seconds: number; readonly how: string; readonly byMe: number; readonly atMe: number }[] = [];
  let alone = 0;
  let within10 = 0;
  let nearCount = 0;
  let racingSteps = 0;
  let copAlert = 0;
  let afterCop = 0;
  let wreckedAt: number | null = null;
  let bustedAt: number | null = null;
  let clubSteps = 0;
  let steals = 0;
  let stolenFromMe = 0;
  let copFights = 0;
  let copsKnockedOff = 0;
  const closeFight = (id: RiderId, how: string) => {
    const f = open.get(id);
    if (!f) return;
    open.delete(id);
    fights.push({ ...f, seconds: +(f.last - f.first).toFixed(1), how });
  };
  // Who hit whom, and the whole race's crashes, stalls, knock-downs and remounts.
  const hitsAtMeBy: Record<string, number> = {};
  let hitsAtMeCops = 0;
  const myLanded = { riders: 0, cops: 0 };
  let koByMe = 0;
  const koOfMe: { t: number; by: string }[] = [];
  let minStamina = 100;
  const oppCrashes: OpponentCrash[] = [];
  const oppStalls: Stall[] = [];
  const copStalls: Stall[] = [];
  const myStalls: PlayerStall[] = [];
  const knockDowns = { player: 0, opponents: 0, notDrivenInto: 0, behindMiddle: 0 };
  const knockDownList: KnockDown[] = [];
  const myCrashes: { t: number; cause: CrashCause; v: number; d: number }[] = [];
  const remountCount = { player: 0, opponents: 0 };
  const remountCrashes: RemountCrash[] = [];
  const lastRemount = new Map<RiderId, { t: number; phase: Phase }>();
  /** Steps each opponent, and each cop, has stood still so far. */
  const still = new Map<RiderId, number>();
  const copStill = new Map<CopId, number>();
  let meStill = 0;
  const name = (id: RiderId) => `${cur.riders[id].name}`;
  /** Ends `who`'s time standing still in `map`, listing it if it lasted `min` steps or more. */
  const closeStall = (map: Map<number, number>, who: number, list: Stall[], min: number, info: Omit<Stall, "who" | "seconds">) => {
    const n = map.get(who) ?? 0;
    if (n >= min) list.push({ who, seconds: +(n / 60).toFixed(1), ...info });
    map.set(who, 0);
  };
  /** What the crash in `e` was into, from the snapshot `before` it. */
  const whatWith = (e: Extract<RaceEvent, { type: "crash" }>, before: RaceSnapshot) => {
    const me = before.riders[e.rider];
    const at = { d: me.distance, off: me.offset };
    if (e.cause === "traffic") {
      const c = before.traffic
        .map((c) => ({ c, g: Math.max(0, Math.abs(c.distance - at.d) - c.length / 2) + Math.max(0, Math.abs(c.offset - at.off) - c.width / 2) }))
        .sort((a, b) => a.g - b.g)[0];
      return c ? `${c.c.kind}${c.c.oncoming ? " oncoming" : ""} ${(c.c.speed * 3.6).toFixed(0)}km/h ${(c.c.distance - at.d).toFixed(1)}m` : "?";
    }
    if (e.cause === "cop") {
      const c = before.cops
        .filter((c) => c.status === "riding")
        .map((c) => ({ c, g: Math.hypot(c.distance - at.d, c.offset - at.off) }))
        .sort((a, b) => a.g - b.g)[0];
      return c
        ? `${c.c.name} ${(c.c.speed * 3.6).toFixed(0)}km/h${c.c.busting !== null ? " busting " + c.c.busting : ""}${c.c.fightingBack !== null ? " fighting " + c.c.fightingBack : ""} off ${c.c.offset.toFixed(1)}`
        : "?";
    }
    if (e.cause === "rider") {
      const r = before.riders
        .filter((r) => r.id !== e.rider && r.status === "racing" && !r.crash)
        .map((r) => ({ r, g: Math.hypot(r.distance - at.d, r.offset - at.off) }))
        .sort((a, b) => a.g - b.g)[0];
      return r ? `${r.r.id === PLAYER ? "the player" : r.r.name} ${(r.r.speed * 3.6).toFixed(0)}km/h ${(r.r.distance - at.d).toFixed(1)}m` : "?";
    }
    if (e.cause === "obstacle") {
      const o = track.obstacles.map((o) => ({ o, g: Math.hypot(o.distance - at.d, o.offset - at.off) })).sort((a, b) => a.g - b.g)[0];
      return o ? `${o.o.kind} at ${o.o.distance.toFixed(0)}/${o.o.offset.toFixed(1)}` : "?";
    }
    return "";
  };
  /** Watches one step's events and snapshot, in the player's race (phase "race") or the fast-forward ("ff"). */
  const watchField = (events: readonly RaceEvent[], phase: Phase) => {
    const lastHitBy = new Map<RiderId, RiderOrCop>();
    for (const e of events) {
      if (e.type === "remounted") {
        if (e.rider === PLAYER) remountCount.player++;
        else remountCount.opponents++;
        lastRemount.set(e.rider, { t: cur.clock, phase });
      }
      if (e.type === "crash") {
        const remounted = lastRemount.get(e.rider);
        if (remounted && cur.clock - remounted.t <= 2) {
          const r = prev.riders[e.rider];
          remountCrashes.push({
            t: +cur.clock.toFixed(2),
            phase,
            who: e.rider === PLAYER ? "player" : r.name,
            after: +(cur.clock - remounted.t).toFixed(2),
            cause: e.cause,
            v: +(e.impactSpeed * 3.6).toFixed(0),
            with: e.cause === "knocked-off" ? "" : whatWith(e, prev),
            aheadOfPlayer: e.rider === PLAYER ? 0 : Math.round(r.distance - prev.riders[PLAYER].distance),
          });
          lastRemount.delete(e.rider);
        }
      }
      if (e.type === "attack-landed" && e.target.kind === "rider") lastHitBy.set(e.target.id, e.attacker);
      if (e.type === "crash" && e.rider !== PLAYER) {
        const r = prev.riders[e.rider];
        const k = track.sampleAt(r.distance).curvature;
        const by = e.cause === "knocked-off" ? lastHitBy.get(e.rider) : null;
        oppCrashes.push({
          t: +cur.clock.toFixed(1),
          phase,
          id: e.rider,
          name: r.name,
          temp: r.temperament,
          cause: e.cause,
          v: +(e.impactSpeed * 3.6).toFixed(0),
          ownV: +(r.speed * 3.6).toFixed(0),
          d: Math.round(r.distance),
          k: +Math.abs(k).toFixed(4),
          bend: Math.abs(k) > BEND,
          off: +r.offset.toFixed(1),
          offRoad: r.offRoad,
          with:
            e.cause === "knocked-off"
              ? by
                ? by.kind === "cop"
                  ? "cop " + by.id
                  : by.id === PLAYER
                    ? "the player"
                    : cur.riders[by.id].name
                : "?"
              : whatWith(e, prev),
          by: e.cause === "knocked-off" ? (by ? (by.kind === "cop" ? "cop" : by.id === PLAYER ? "player" : "opponent") : "?") : null,
        });
      }
      if (e.type === "knocked-down") {
        if (e.rider === PLAYER) knockDowns.player++;
        else knockDowns.opponents++;
        const body = prev.riders[e.rider];
        const car = cur.traffic
          .map((c) => ({ c, d: Math.abs(c.distance - body.distance) - c.length / 2, s: Math.abs(c.offset - body.offset) - c.width / 2 }))
          .filter(({ d, s }) => d < 0.8 && s < 0.8)
          .sort((a, b) => a.d + a.s - (b.d + b.s))[0]?.c;
        const who = e.rider === PLAYER ? "player" : cur.riders[e.rider].name;
        if (car) {
          const dir = car.oncoming ? -1 : 1;
          const closing = dir * (dir * car.speed - body.speed);
          if (closing <= 1) knockDowns.notDrivenInto++;
          const behind = dir * (body.distance - car.distance) < 0;
          if (behind) knockDowns.behindMiddle++;
          knockDownList.push({
            t: +cur.clock.toFixed(1),
            phase,
            who,
            car: `${car.kind}${car.oncoming ? " oncoming" : ""}`,
            carV: +(car.speed * 3.6).toFixed(0),
            closing: +closing.toFixed(1),
            behind,
            d: Math.round(body.distance),
          });
        } else knockDownList.push({ t: +cur.clock.toFixed(1), phase, who, car: "?" });
      }
    }
    if (cur.countdown > 0) return;
    for (const r of cur.riders) {
      if (r.id === PLAYER) continue;
      const stopped = r.status === "racing" && !r.crash && r.speed < 0.5;
      if (stopped) still.set(r.id, (still.get(r.id) ?? 0) + 1);
      else if (still.get(r.id)) closeStall(still, r.id, oppStalls, 300, { name: r.name, phase, at: Math.round(cur.clock), d: Math.round(r.distance), off: +r.offset.toFixed(1) });
    }
    for (const c of cur.cops) {
      const stopped = c.status === "riding" && Math.abs(c.offset) < half && Math.abs(c.speed) < 0.5;
      if (stopped) copStill.set(c.id, (copStill.get(c.id) ?? 0) + 1);
      else if (copStill.get(c.id)) closeStall(copStill, c.id, copStalls, 300, { phase, at: Math.round(cur.clock), d: Math.round(c.distance), off: +c.offset.toFixed(1) });
    }
  };

  while (!over && steps < CAP_STEPS) {
    race.step(bot.decide(prev, cur));
    steps++;
    prev = cur;
    cur = race.snapshot();
    const me = cur.riders[PLAYER];
    const t = cur.clock;
    const events = race.drainEvents();
    bot.hear(events);
    for (const e of events) {
      if (e.type === "crash" && e.rider === PLAYER) {
        crashes[e.cause]++;
        myCrashes.push({ t: +t.toFixed(1), cause: e.cause, v: +(e.impactSpeed * 3.6).toFixed(0), d: Math.round(prev.riders[PLAYER].distance) });
        for (const id of [...open.keys()]) closeFight(id, e.cause === "knocked-off" ? "player knocked off" : "player crashed");
      }
      if (e.type === "crash" && e.rider !== PLAYER) {
        opp[e.cause]++;
        if (open.has(e.rider)) closeFight(e.rider, e.cause === "knocked-off" ? "opponent knocked off" : "opponent crashed");
      }
      if (e.type === "knocked-down" && e.rider === PLAYER) knockedDown++;
      if (e.type === "busted" && e.rider !== PLAYER) opp.busted++;
      if (e.type === "wrecked" && e.rider !== PLAYER) opp.wrecked++;
      if (e.type === "wrecked" && e.rider === PLAYER) wreckedAt = t;
      if (e.type === "busted" && e.rider === PLAYER) bustedAt = t;
      if (e.type === "weapon-stolen" && e.by.kind === "rider" && e.by.id === PLAYER) steals++;
      if (e.type === "weapon-stolen" && e.from.kind === "rider" && e.from.id === PLAYER) stolenFromMe++;
      if (e.type === "cop-retaliating" && e.target === PLAYER) copFights++;
      if (e.type === "cop-knocked-off") copsKnockedOff++;
      if (e.type === "attack-landed" && e.attacker.kind === "rider" && e.target.kind === "rider") {
        const other = e.attacker.id === PLAYER ? e.target.id : e.target.id === PLAYER ? e.attacker.id : null;
        if (other !== null) {
          const f = open.get(other) ?? { first: t, last: t, byMe: 0, atMe: 0 };
          f.last = t;
          if (e.attacker.id === PLAYER) f.byMe++;
          else f.atMe++;
          open.set(other, f);
        }
      }
      if (e.type === "player-race-over") over = e.outcome;
      if (e.type === "attack-landed" && e.target.kind === "rider" && e.target.id === PLAYER) {
        if (e.attacker.kind === "cop") hitsAtMeCops++;
        else hitsAtMeBy[name(e.attacker.id)] = (hitsAtMeBy[name(e.attacker.id)] ?? 0) + 1;
      }
      if (e.type === "attack-landed" && e.attacker.kind === "rider" && e.attacker.id === PLAYER) myLanded[e.target.kind === "cop" ? "cops" : "riders"]++;
    }
    // Who knocked whom off: the player, and the opponents the player knocked off.
    const lastHitBy = new Map<RiderId, RiderOrCop>();
    for (const e of events) {
      if (e.type === "attack-landed" && e.target.kind === "rider") lastHitBy.set(e.target.id, e.attacker);
      if (e.type === "crash" && e.cause === "knocked-off") {
        const by = lastHitBy.get(e.rider);
        if (e.rider === PLAYER) koOfMe.push({ t: +t.toFixed(1), by: by ? (by.kind === "cop" ? "cop" : name(by.id) + "(" + cur.riders[by.id].temperament + ")") : "?" });
        else if (by && by.kind === "rider" && by.id === PLAYER) koByMe++;
      }
    }
    watchField(events, "race");
    for (const [id, f] of open) if (t - f.last > FIGHT_GAP_SECONDS) closeFight(id, "split up");
    if (cur.countdown > 0 || me.status !== "racing") continue;
    racingSteps++;
    if (!me.crash) minStamina = Math.min(minStamina, me.stamina);
    if (me.weapon === "club") clubSteps++;
    const others = cur.riders.filter((r) => r.id !== PLAYER && r.status === "racing");
    const gaps = others.map((r) => Math.abs(r.distance - me.distance));
    if (!gaps.some((g) => g < 50)) alone++;
    if (gaps.some((g) => g < 10)) within10++;
    nearCount += gaps.filter((g) => g < 100).length;
    if (cur.cops.some((c) => c.status !== "waiting")) {
      afterCop++;
      if (cur.cops.some((c) => c.near)) copAlert++;
    }
    if (!me.crash && me.speed < 0.5) meStill++;
    else if (meStill) {
      if (meStill >= 600) myStalls.push({ seconds: +(meStill / 60).toFixed(1), at: Math.round(t), d: Math.round(me.distance), off: +me.offset.toFixed(1) });
      meStill = 0;
    }
  }
  if (meStill >= 600) {
    const me = cur.riders[PLAYER];
    myStalls.push({ seconds: +(meStill / 60).toFixed(1), at: Math.round(cur.clock), toTheEnd: true, d: Math.round(me.distance), off: +me.offset.toFixed(1) });
  }
  for (const id of [...open.keys()]) closeFight(id, "race over");

  // Race the rest of the field to the finish a step at a time, watching it (the same steps as fastForward()).
  let results: RaceResults | null = null;
  let ffSteps = 0;
  if (over) {
    for (;;) {
      results = race.fastForward(1);
      prev = cur;
      cur = race.snapshot();
      const events = race.drainEvents();
      for (const e of events) {
        if (e.type === "busted" && e.rider !== PLAYER) opp.bustedFF = (opp.bustedFF ?? 0) + 1;
        if (e.type === "wrecked" && e.rider !== PLAYER) opp.wreckedFF = (opp.wreckedFF ?? 0) + 1;
      }
      watchField(events, "ff");
      if (results.complete) break;
      ffSteps++;
    }
  }
  // Close the stalls still running at the end.
  for (const r of cur.riders) {
    if (r.id !== PLAYER && still.get(r.id)) {
      closeStall(still, r.id, oppStalls, 300, { name: r.name, phase: over ? "ff" : "race", at: Math.round(cur.clock), d: Math.round(r.distance), off: +r.offset.toFixed(1), toTheEnd: true });
    }
  }
  for (const c of cur.cops) {
    if (copStill.get(c.id)) closeStall(copStill, c.id, copStalls, 300, { phase: over ? "ff" : "race", at: Math.round(cur.clock), d: Math.round(c.distance), off: +c.offset.toFixed(1), toTheEnd: true });
  }
  const standings = results?.standings ?? [];
  const oppTimes = standings.flatMap((s) => (s.rider !== PLAYER && s.time !== null ? [+s.time.toFixed(1)] : []));
  const racing = Math.max(1, racingSteps);
  return {
    seed,
    outcome: over ?? "unfinished",
    pos: results?.position ?? null,
    time: results?.time != null ? +results.time.toFixed(1) : null,
    winner: results ? +(results.standings[0].time ?? NaN).toFixed(1) : null,
    endedAt: +(steps / STEPS_PER_SECOND - 3).toFixed(0),
    crashes,
    knockedDown,
    wreckedAt,
    bustedAt,
    fights: fights.length,
    fightSeconds: fights.map((f) => f.seconds),
    fightEnds: fights.reduce<Record<string, number>>((a, f) => ((a[f.how] = (a[f.how] || 0) + 1), a), {}),
    longest: fights.length ? Math.max(...fights.map((f) => f.seconds)) : 0,
    hitsByMe: fights.reduce((a, f) => a + f.byMe, 0),
    hitsAtMe: fights.reduce((a, f) => a + f.atMe, 0),
    steals,
    stolenFromMe,
    clubShare: +(clubSteps / racing).toFixed(2),
    copFights,
    copsKnockedOff,
    aloneShare: +(alone / racing).toFixed(2),
    within10Share: +(within10 / racing).toFixed(2),
    meanWithin100: +(nearCount / racing).toFixed(1),
    copAlertShare: +(copAlert / Math.max(1, afterCop)).toFixed(2),
    opp,
    unplaced: results ? results.standings.filter((s) => s.status === "racing").length : null,
    hitsAtMeBy,
    hitsAtMeCops,
    myLanded,
    koByMe,
    koOfMe,
    minStamina: Math.round(minStamina),
    bot: bot.stats(),
    oppCrashes,
    oppStalls,
    copStalls,
    myStalls,
    knockDowns,
    knockDownList,
    myCrashes,
    remountCount,
    remountCrashes,
    ffSeconds: +(ffSteps / STEPS_PER_SECOND).toFixed(1),
    field: results
      ? {
          complete: results.complete,
          oppTimes: oppTimes.sort((a, b) => a - b),
          busted: standings.filter((s) => s.rider !== PLAYER && s.status === "busted").map((s) => s.name),
          wrecked: standings.filter((s) => s.rider !== PLAYER && s.status === "wrecked").map((s) => s.name),
          noTime: standings
            .filter((s) => s.status === "racing")
            .map((s) => {
              const r = cur.riders[s.rider];
              return { name: s.name, d: Math.round(r.distance), off: +r.offset.toFixed(1), v: +r.speed.toFixed(1), crash: r.crash };
            }),
        }
      : null,
  };
}

/** A run's SUMMARY line: its bot, settings and race options, then its races together. */
function summaryOf(rows: readonly RaceRow[], mode: BotName, cfg: string, opts: string) {
  const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const fin = rows.filter((r) => r.outcome === "finished");
  const allFights = rows.flatMap((r) => r.fightSeconds);
  const sortedF = [...allFights].sort((a, b) => a - b);
  const ends: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.fightEnds)) ends[k] = (ends[k] || 0) + v;
  const crashSum = (k: CrashCause) => rows.reduce((a, r) => a + r.crashes[k], 0) / rows.length;
  const oppSum = (k: keyof OpponentCounts) => rows.reduce((a, r) => a + (r.opp[k] ?? 0), 0) / rows.length;
  const finite = (xs: (number | null)[]) => xs.filter((x): x is number => Number.isFinite(x));
  return {
    mode,
    cfg,
    opts,
    races: rows.length,
    finished: fin.length,
    wrecked: rows.filter((r) => r.outcome === "wrecked").length,
    busted: rows.filter((r) => r.outcome === "busted").length,
    unfinished: rows.filter((r) => r.outcome === "unfinished").length,
    positions: fin
      .map((r) => r.pos)
      .sort((a, b) => (a ?? 0) - (b ?? 0))
      .join(","),
    qualified: fin.filter((r) => r.pos !== null && r.pos <= 3).length,
    meanTime: +avg(finite(fin.map((r) => r.time))).toFixed(1),
    winnerTimes: `${Math.min(...finite(rows.map((r) => r.winner)))}-${Math.max(...finite(rows.map((r) => r.winner)))}`,
    perRace: {
      crashes: +(crashSum("traffic") + crashSum("rider") + crashSum("obstacle") + crashSum("knocked-off") + crashSum("cop")).toFixed(2),
      intoCops: +crashSum("cop").toFixed(2),
      traffic: +crashSum("traffic").toFixed(2),
      runIns: +crashSum("rider").toFixed(2),
      obstacle: +crashSum("obstacle").toFixed(2),
      knockedOff: +crashSum("knocked-off").toFixed(2),
      knockedDown: +avg(rows.map((r) => r.knockedDown)).toFixed(2),
      fights: +avg(rows.map((r) => r.fights)).toFixed(1),
      hitsByMe: +avg(rows.map((r) => r.hitsByMe)).toFixed(1),
      hitsAtMe: +avg(rows.map((r) => r.hitsAtMe)).toFixed(1),
      steals: +avg(rows.map((r) => r.steals)).toFixed(2),
      copFights: +avg(rows.map((r) => r.copFights)).toFixed(2),
      oppTraffic: +oppSum("traffic").toFixed(2),
      oppRunIns: +oppSum("rider").toFixed(2),
      oppObstacle: +oppSum("obstacle").toFixed(2),
      oppIntoCops: +oppSum("cop").toFixed(2),
      oppKnockedOff: +oppSum("knocked-off").toFixed(2),
      oppBusted: +oppSum("busted").toFixed(2),
      oppWrecked: +oppSum("wrecked").toFixed(2),
    },
    aloneShare: +avg(rows.map((r) => r.aloneShare)).toFixed(2),
    within10Share: +avg(rows.map((r) => r.within10Share)).toFixed(2),
    meanWithin100: +avg(rows.map((r) => r.meanWithin100)).toFixed(1),
    copAlertShare: +avg(rows.map((r) => r.copAlertShare)).toFixed(2),
    bustedAt: rows
      .flatMap((r) => (r.bustedAt ? [Math.round(r.bustedAt)] : []))
      .join(","),
    wreckedAt: rows
      .flatMap((r) => (r.wreckedAt ? [Math.round(r.wreckedAt)] : []))
      .join(","),
    fightSeconds: allFights.length
      ? { n: allFights.length, median: sortedF[Math.floor(sortedF.length / 2)], p90: sortedF[Math.floor(sortedF.length * 0.9)], max: sortedF[sortedF.length - 1] }
      : null,
    fightEnds: ends,
  };
}

export type RunSummary = ReturnType<typeof summaryOf>;

/** In the player's race, or while the rest of the field is raced to the finish once it is over. */
type Phase = "race" | "ff";

/** The opponents' crashes by cause, and how many were busted or wrecked (in the fast-forward too: `bustedFF`, `wreckedFF`). */
type OpponentCounts = Record<CrashCause | "busted" | "wrecked", number> & { bustedFF?: number; wreckedFF?: number };

interface Fight {
  readonly first: number;
  last: number;
  byMe: number;
  atMe: number;
}

/** An opponent or a cop standing still on their bike 5 s or more. */
interface Stall {
  readonly who: number;
  readonly seconds: number;
  readonly name?: string;
  readonly phase: Phase;
  readonly at: number;
  readonly d: number;
  readonly off: number;
  readonly toTheEnd?: true;
}

/** The player standing still on their bike 10 s or more. */
interface PlayerStall {
  readonly seconds: number;
  readonly at: number;
  readonly toTheEnd?: true;
  readonly d: number;
  readonly off: number;
}

interface OpponentCrash {
  readonly t: number;
  readonly phase: Phase;
  readonly id: RiderId;
  readonly name: string;
  readonly temp: Temperament | null;
  readonly cause: CrashCause;
  /** km/h: the impact speed, and its own speed the step before. */
  readonly v: number;
  readonly ownV: number;
  readonly d: number;
  readonly k: number;
  readonly bend: boolean;
  readonly off: number;
  readonly offRoad: boolean;
  readonly with: string;
  readonly by: "cop" | "player" | "opponent" | "?" | null;
}

interface KnockDown {
  readonly t: number;
  readonly phase: Phase;
  readonly who: string;
  readonly car: string;
  readonly carV?: number;
  readonly closing?: number;
  readonly behind?: boolean;
  readonly d?: number;
}

interface RemountCrash {
  readonly t: number;
  readonly phase: Phase;
  readonly who: string;
  /** Seconds after getting back on. */
  readonly after: number;
  readonly cause: CrashCause;
  readonly v: number;
  readonly with: string;
  readonly aheadOfPlayer: number;
}

/** A race's row in a run's log. */
export interface RaceRow {
  readonly seed: number;
  readonly outcome: RaceOutcome | "unfinished";
  readonly pos: number | null;
  readonly time: number | null;
  readonly winner: number | null;
  readonly endedAt: number;
  readonly crashes: Readonly<Record<CrashCause, number>>;
  readonly knockedDown: number;
  readonly wreckedAt: number | null;
  readonly bustedAt: number | null;
  readonly fights: number;
  readonly fightSeconds: readonly number[];
  readonly fightEnds: Readonly<Record<string, number>>;
  readonly longest: number;
  readonly hitsByMe: number;
  readonly hitsAtMe: number;
  readonly steals: number;
  readonly stolenFromMe: number;
  readonly clubShare: number;
  readonly copFights: number;
  readonly copsKnockedOff: number;
  readonly aloneShare: number;
  readonly within10Share: number;
  readonly meanWithin100: number;
  readonly copAlertShare: number;
  readonly opp: Readonly<OpponentCounts>;
  readonly unplaced: number | null;
  readonly hitsAtMeBy: Readonly<Record<string, number>>;
  readonly hitsAtMeCops: number;
  readonly myLanded: { readonly riders: number; readonly cops: number };
  readonly koByMe: number;
  readonly koOfMe: readonly { readonly t: number; readonly by: string }[];
  readonly minStamina: number;
  readonly bot: Readonly<Record<string, number>> | null;
  readonly oppCrashes: readonly OpponentCrash[];
  readonly oppStalls: readonly Stall[];
  readonly copStalls: readonly Stall[];
  readonly myStalls: readonly PlayerStall[];
  readonly knockDowns: { readonly player: number; readonly opponents: number; readonly notDrivenInto: number; readonly behindMiddle: number };
  readonly knockDownList: readonly KnockDown[];
  readonly myCrashes: readonly { readonly t: number; readonly cause: CrashCause; readonly v: number; readonly d: number }[];
  readonly remountCount: { readonly player: number; readonly opponents: number };
  readonly remountCrashes: readonly RemountCrash[];
  readonly ffSeconds: number;
  readonly field: {
    readonly complete: boolean;
    readonly oppTimes: readonly number[];
    readonly busted: readonly string[];
    readonly wrecked: readonly string[];
    readonly noTime: readonly { readonly name: string; readonly d: number; readonly off: number; readonly v: number; readonly crash: string | null }[];
  } | null;
}
