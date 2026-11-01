import type { Difficulty } from "@/race";
import { BOT_NAMES, DIFFICULTIES, type BotName } from "./bot";
import { readLogs, type CutInLog, type LoggedRace, type RunLog } from "./logs";

/**
 * The 1.1.0 release notes' measured claims (CHANGELOG.md), from the logs in `paths`, each claim in the notes' words
 * with the numbers behind it, worked out as the play-tests' report scripts did; with `against`, the same runs in other
 * logs, such as another commit's, set beside them. Returns the report's lines.
 */
export function report(paths: readonly string[], against: readonly string[]): string[] {
  const logs = readLogs(paths);
  const base = against.length ? readLogs(against) : null;
  const runs = runsOf(logs.runs);
  const baseRuns = base ? runsOf(base.runs) : null;
  const runOf = (difficulty: Difficulty, bot: BotName, pace: number) => runs.get(keyOf(difficulty, bot, pace)) ?? [];
  const out = [
    "# The 1.1.0 release notes' measured claims",
    "",
    `From ${logs.runs.length} run logs and ${logs.cutIns.length} cut-in logs in ${paths.join(", ")}. ± is one standard error.`,
    "A run's seed ranges are given apart, then together.",
  ];
  /** A section: a claim in the notes' words, then the numbers behind it, with a note on them, if any of its runs are in the logs. */
  const section = (heading: string, lines: readonly string[], note?: string) => {
    out.push("", `## ${heading}`, "");
    if (note && lines.length) out.push(note, "");
    out.push(...(lines.length ? lines : ["- (none of its runs is in these logs)"]));
  };
  const each = (difficulty: Difficulty, bot: BotName, pace: number, say: (races: Races) => string, label = `${bot} ${paceText(pace)}`) =>
    blocks(runOf(difficulty, bot, pace)).map(([seeds, races]) => `- ${label}, seeds ${seeds}: ${say(races)}`);

  section("Easy: a first-timer (riding at 75% of a safe pace) finishes 8th on average, seldom alone and never knocked off.", each("easy", "racer", 0.75, firstTimer));

  section("Easy: an average rider qualifies in two races of three.", each("easy", "racer", 0.85, qualifying));

  section(
    "Easy: catch-up also keeps the field closer to you when you fall behind.",
    (["easy", "normal"] as const).flatMap((difficulty) => each(difficulty, "racer", 0.75, timeAlone, `${capital(difficulty)}, racer 0.75`)),
    "The share of the race with no opponent racing within 50 m (alone), and with one within 10 m.",
  );

  const normal = [...each("normal", "racer", 0.92, qualifying, "racer 0.92 (a decent rider)"), ...each("normal", "racer", 1, qualifying, "racer 1.0 (an expert)")];
  if (baseRuns) {
    const totals = new Map<string, { q: number; n: number; baseQ: number }>();
    normal.push("", `Every Normal run against ${against.join(", ")}, as two samples (this less that):`, "");
    for (const [key, logsHere] of runs) {
      const there = baseRuns.get(key);
      if (logsHere[0].difficulty !== "normal" || !there) continue;
      for (const [seeds, races] of blocks(logsHere)) {
        const theirs = onSeeds(there, races.rows);
        if (theirs.length < races.rows.length) continue;
        normal.push(`- ${key.slice("normal ".length)}, seeds ${seeds}: ${twoSamples(races.rows, theirs)}`);
        // Totals over one log's seeds at a time, such as every run's seeds 1-24.
        if (races.logs.length > 1) continue;
        const t = totals.get(seeds) ?? { q: 0, n: 0, baseQ: 0 };
        totals.set(seeds, { q: t.q + races.rows.filter(qualified).length, n: t.n + races.rows.length, baseQ: t.baseQ + theirs.filter(qualified).length });
      }
    }
    for (const [seeds, t] of totals) normal.push(`- every Normal run above, seeds ${seeds}: ${t.q} of ${t.n} qualified, against ${t.baseQ}`);
  } else if (normal.length) normal.push("", "(Give v1.0.0's Normal runs with --against to set these beside them.)");
  section("Normal: plays as 1.0.0 did.", normal);

  section("Hard: an expert qualifies in about two races of five,", each("hard", "racer", 1, qualifying));

  section("Hard: ... and one who hits back does as well.", [
    ...each("hard", "racer", 1, fighting),
    ...each("hard", "counter", 1, fighting),
    ...against2("counter-puncher against racer at 1.0", runOf("hard", "counter", 1), runOf("hard", "racer", 1)),
  ]);

  section(
    "Hard: at a slower pace, one who hits back takes fewer hits than one who doesn't.",
    [0.92, 0.85].flatMap((pace) => [
      ...each("hard", "racer", pace, fighting),
      ...each("hard", "counter", pace, fighting),
      ...against2(`counter-puncher against racer at ${pace}`, runOf("hard", "counter", pace), runOf("hard", "racer", pace)),
    ]),
  );

  section(
    "Hard: opponents leave you alone for a while after four hits you don't answer, before a club can knock you off from full stamina.",
    (
      [
        ["racer", "never hits back"],
        ["counter", "hits back"],
        ["brawler", "starts fights"],
      ] as const
    ).flatMap(([bot, who]) => {
      const hard = [...runs.values()].filter((these) => these[0].difficulty === "hard" && these[0].bot === bot);
      const rows = hard.flatMap((these) => these.flatMap((l) => l.rows));
      const paces = hard.map((these) => `${paceText(these[0].pace)}: ${knockOffs(these.flatMap((l) => l.rows))} in ${these.reduce((a, l) => a + l.rows.length, 0)}`);
      return rows.length ? [`- ${bot} (${who}): knocked off ${knockOffs(rows)} times in ${rows.length} races (${paces.join("; ")}); its stamina ran out in ${rows.filter((r) => r.minStamina <= 0).length}`] : [];
    }),
  );

  const riding: string[] = [];
  const claimRows = [...RIDING_CLAIM.map((pace) => runOf("normal", "racer", pace)), runOf("normal", "brawler", 1)].flatMap((these) => these.flatMap((l) => l.rows)).filter((r) => r.seed >= 1 && r.seed <= 24);
  if (claimRows.length) {
    riding.push(`- the claim's runs (Normal: the racer at 0.75, 0.85, 0.92 and 1.0, and the brawler; seeds 1-24): ${claimRows.length} races; ${claimRows.filter(neverEnded).length} never ended (the player's race not over at the 7-minute cap); ${withoutATime(claimRows)} riders without a time`);
  }
  const all = racesIn(logs.runs);
  if (all.length) {
    const unfinished = all.filter(({ row }) => neverEnded(row)).map(({ row, log }) => `${capital(log.difficulty)} ${log.bot} ${paceText(log.pace)} seed ${row.seed}`);
    const copStalls = all.flatMap(({ row }) => row.copStalls);
    riding.push(
      `- every run, ${all.length} races: ${unfinished.length} never ended${unfinished.length ? ` (${unfinished.join(", ")})` : ""}; ` +
        `${withoutATime(all.map(({ row }) => row))} riders without a time; ` +
        `opponents standing still on their bikes 5 s or more ${all.reduce((a, { row }) => a + row.oppStalls.length, 0)} times; ` +
        `cops standing in the road 5 s or more ${copStalls.filter((s) => s.phase === "race").length} times while the player raced and ${copStalls.filter((s) => s.phase === "ff").length} after; ` +
        `the player standing on the bike 10 s or more ${all.reduce((a, { row }) => a + row.myStalls.length, 0)} times`,
    );
  }
  section("Riding: in 120 bot races, the riders left stuck like that went from 8 to 0.", riding);

  const nine = NINE_RUNS.flatMap(([difficulty, bot, pace, first, last]) => racesIn(runOf(difficulty, bot, pace)).filter(({ row }) => row.seed >= first && row.seed <= last));
  section("Known limitation: getting back on the bike just as a car comes past can crash you again at once (about one race in 27, as in 1.0.0).", [
    ...(nine.length ? [`- the nine runs the notes' figure was first measured on (seeds 25-48 of Easy racer 0.75 and 0.85, Normal racer 0.92 and 1.0, Hard racer and counter 0.92 and 1.0, and Easy counter 0.85 on seeds 1-24): ${remounts(nine)}`] : []),
    ...(all.length ? [`- every run: ${remounts(all)}`] : []),
  ]);

  section(
    "Known limitation: an opponent pulling out round a car, or back to its line, doesn't look behind it, so it can cut across a much faster rider coming up behind (at full speed, about one race in eight, as in 1.0.0).",
    cutIns(logs.cutIns),
  );
  if (base?.cutIns.length) out.push("", `In ${against.join(", ")}:`, "", ...cutIns(base.cutIns));

  if (baseRuns) {
    const pairs = [...runs].flatMap(([key, logsHere]) => {
      const mine = logsHere.flatMap((l) => l.rows);
      const theirs = onSeeds(baseRuns.get(key) ?? [], mine);
      return theirs.length ? [`- ${key}, seeds ${seedsOf(theirs)}: ${paired(mine, theirs)}`] : [];
    });
    section(
      `Against ${against.join(", ")}: every run in both, seed by seed`,
      pairs.length ? pairs : ["- (no run is in both)"],
      "This less that, each race set beside the same seed's: the mean change a race, with its standard error. A race the same in both counts as no change.",
    );
  }
  return out;
}

/** Every race of `logs`, with its log. */
const racesIn = (logs: readonly RunLog[]) => logs.flatMap((log) => log.rows.map((row) => ({ row, log })));

/** The runs whose seeds 1-24 the riding claim counts: Normal, the racer at these paces, and the brawler at 1.0. */
const RIDING_CLAIM = [0.75, 0.85, 0.92, 1];

/** The nine runs whose remounts the notes' "one race in 27" was measured on: [difficulty, bot, pace, first seed, last seed]. */
const NINE_RUNS: readonly (readonly [Difficulty, BotName, number, number, number])[] = [
  ["easy", "racer", 0.75, 25, 48],
  ["easy", "racer", 0.85, 25, 48],
  ["normal", "racer", 0.92, 25, 48],
  ["normal", "racer", 1, 25, 48],
  ["hard", "racer", 0.92, 25, 48],
  ["hard", "racer", 1, 25, 48],
  ["hard", "counter", 0.92, 25, 48],
  ["hard", "counter", 1, 25, 48],
  ["easy", "counter", 0.85, 1, 24],
];

const keyOf = (difficulty: Difficulty, bot: BotName, pace: number) => `${difficulty} ${bot} ${paceText(pace)}`;
const paceText = (pace: number) => (Number.isInteger(pace) ? pace.toFixed(1) : String(pace));

/** The logs of each run (difficulty, bot and pace), by their first seed; two logs of a run must not share a seed. */
function runsOf(logs: readonly RunLog[]) {
  const runs = new Map<string, RunLog[]>();
  for (const log of logs) {
    const key = keyOf(log.difficulty, log.bot, log.pace);
    const these = runs.get(key) ?? [];
    const seeds = new Set(these.flatMap((l) => l.rows.map((r) => r.seed)));
    const twice = log.rows.find((r) => seeds.has(r.seed));
    if (twice) throw new Error(`Seed ${twice.seed} of ${key} is in two logs, ${log.file} and another`);
    runs.set(key, [...these, log].sort((a, b) => (a.rows[0]?.seed ?? 0) - (b.rows[0]?.seed ?? 0)));
  }
  return new Map([...runs].sort(([a], [b]) => order(a) - order(b)));
}

/** Runs in the order the notes give them: by difficulty, then bot, then pace. */
function order(key: string) {
  const [difficulty, bot, pace] = key.split(" ");
  return DIFFICULTIES.findIndex((d) => d === difficulty) * 1000 + BOT_NAMES.findIndex((b) => b === bot) * 100 + Number(pace) * 10;
}

/** Races of a run, with the time-alone shares its logs' SUMMARY lines give (each log's own, rounded, as the reports took them). */
interface Races {
  readonly logs: readonly RunLog[];
  readonly rows: readonly LoggedRace[];
  readonly aloneShare: number;
  readonly within10Share: number;
}

/** A run's logs one by one, labelled by their seeds, then all of them together if there is more than one. */
function blocks(logs: readonly RunLog[]): [string, Races][] {
  const racesOf = (these: readonly RunLog[]): Races => ({
    logs: these,
    rows: these.flatMap((l) => l.rows),
    aloneShare: mean(these.map((l) => l.aloneShare)),
    within10Share: mean(these.map((l) => l.within10Share)),
  });
  const each = logs.map((l): [string, Races] => [seedsOf(l.rows), racesOf([l])]);
  return logs.length > 1 ? [...each, [seedsOf(logs.flatMap((l) => l.rows)), racesOf(logs)]] : each;
}

/** Seeds as ranges: "1-24", or "1-24, 30-31". */
function seedsOf(rows: readonly { readonly seed: number }[]) {
  const seeds = [...new Set(rows.map((r) => r.seed))].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < seeds.length; ) {
    let j = i;
    while (j + 1 < seeds.length && seeds[j + 1] === seeds[j] + 1) j++;
    ranges.push(i === j ? `${seeds[i]}` : `${seeds[i]}-${seeds[j]}`);
    i = j + 1;
  }
  return ranges.join(", ");
}

/** The races of `logs` on the seeds of `rows`. */
function onSeeds(logs: readonly RunLog[], rows: readonly LoggedRace[]) {
  const seeds = new Set(rows.map((r) => r.seed));
  return logs.flatMap((l) => l.rows).filter((r) => seeds.has(r.seed));
}

// How the play-tests' reports put each claim.

function firstTimer(races: Races) {
  const s = standing(races.rows);
  return (
    `mean position ${f1(s.meanPosition)} ± ${f1(s.positionSE)} (median ${ordinal(s.medianPosition)}, ${s.range}); ` +
    `alone ${pct(races.aloneShare)} ± ${pct(se(races.rows.map((r) => r.aloneShare)))}, someone within 10 m ${pct(races.within10Share)}; ` +
    `knock-offs ${knockOffs(races.rows)} in ${races.rows.length}`
  );
}

function qualifying(races: Races) {
  const s = standing(races.rows);
  const p = s.q / s.n;
  return `${s.q} of ${s.n} (${s.wins} wins), ${pct(p)} ± ${pct(Math.sqrt((p * (1 - p)) / s.n))}; mean position ${f1(s.meanPosition)} ± ${f1(s.positionSE)}`;
}

function fighting(races: Races) {
  const s = standing(races.rows);
  const hits = races.rows.map((r) => r.hitsAtMe);
  return `${s.q} of ${s.n} qualified; mean position ${f1(s.meanPosition)} ± ${f1(s.positionSE)}; hits taken ${f1(mean(hits))} ± ${f1(se(hits))} a race; knock-offs ${f2(knockOffs(races.rows) / s.n)} a race`;
}

function timeAlone(races: Races) {
  return `alone ${pct(races.aloneShare)} ± ${pct(se(races.rows.map((r) => r.aloneShare)))}, someone within 10 m ${pct(races.within10Share)} ± ${pct(se(races.rows.map((r) => r.within10Share)))}`;
}

/** Two runs on the same seeds as two samples (this less that): qualifying, the mean position of the races finished, and hits taken. */
function twoSamples(a: readonly LoggedRace[], b: readonly LoggedRace[]) {
  const c = compare(a, b);
  return (
    `${c.a.q} against ${c.b.q} qualified (${signed(c.qualifiedPoints, 1)} ± ${c.qualifiedPointsSE.toFixed(1)} points); ` +
    `mean position ${f1(c.a.meanPosition)} against ${f1(c.b.meanPosition)} (${signed(c.position, 2)} ± ${c.positionSE.toFixed(2)}); ` +
    `hits taken ${f1(c.a.hits)} against ${f1(c.b.hits)} (${signed(c.hits, 2)} ± ${c.hitsSE.toFixed(2)}) a race`
  );
}

/** Two bots' runs on the same difficulty, over the seeds both rode, as two samples (this less that), with their knock-offs. */
function against2(what: string, these: readonly RunLog[], those: readonly RunLog[]) {
  const theirs = onSeeds(those, these.flatMap((l) => l.rows));
  const mine = onSeeds(these, theirs);
  return mine.length ? [`- ${what}, seeds ${seedsOf(mine)}: ${twoSamples(mine, theirs)}; knock-offs ${knockOffs(mine)} and ${knockOffs(theirs)}`] : [];
}

/** The cut-in logs, a difficulty at a time, then all together. */
function cutIns(logs: readonly CutInLog[]) {
  const order = (log: CutInLog) => DIFFICULTIES.indexOf(log.difficulty);
  const lines = [...logs]
    .sort((a, b) => order(a) - order(b))
    .map((log) => {
      const n = log.races.length;
      const cut = log.runIns.filter((r) => r.cutAcross);
      return (
        `- ${capital(log.difficulty)}, seeds ${seedsOf(log.races)}: ${log.runIns.length} run-ins (${(log.runIns.length / n).toFixed(2)} a race), ` +
        `${log.runIns.filter((r) => r.who === "they moved across into me").length} with the opponent moving across into the racer; ` +
        `${cut.length} strict cut-across (${(cut.length / n).toFixed(2)} a race), in ${new Set(cut.map((r) => r.seed)).size} of ${n} races` +
        (cut.length ? `: ${cut.map((r) => `seed ${r.seed} ${r.t} s ${r.them}`).join(", ")}` : "")
      );
    });
  if (logs.length > 1) {
    const races = logs.reduce((a, l) => a + l.races.length, 0);
    const cut = logs.flatMap((l) => l.runIns.filter((r) => r.cutAcross).map((r) => `${l.difficulty} ${r.seed}`));
    const inRaces = new Set(cut).size;
    lines.push(
      `- all: ${logs.reduce((a, l) => a + l.runIns.length, 0)} run-ins; ${cut.length} strict cut-across in ${inRaces} races of ${races}: one race in ${oneIn(races, inRaces, 0)} (one in ${oneIn(races, cut.length, 1)} counting each cut-across)`,
    );
  }
  return lines;
}

/** The player's remounts, and their crashes within 1 s and 2 s of one (the logs list those within 2 s). */
function remounts(races: readonly { readonly row: LoggedRace; readonly log: RunLog }[]) {
  const counted = races.filter(({ row }) => row.remountCount !== undefined);
  if (!counted.length) return "(no log records remounts)";
  const remounted = counted.reduce((a, { row }) => a + (row.remountCount?.player ?? 0), 0);
  const crashes = counted.flatMap(({ row, log }) => (row.remountCrashes ?? []).filter((c) => c.who === "player").map((c) => ({ ...c, seed: row.seed, log })));
  const intoCars = crashes.filter((c) => c.cause === "traffic").length;
  const others = crashes.filter((c) => c.cause !== "traffic").map((c) => `${c.after} s after, into ${c.with || c.cause}, in ${capital(c.log.difficulty)} ${c.log.bot} ${paceText(c.log.pace)} seed ${c.seed}`);
  // A race in how many, with the count's standard error (√k) carried over: between n/(k+√k) and n/(k-√k).
  const k = crashes.filter((c) => c.after <= 1).length;
  const n = counted.length;
  return (
    `${n} races; the player got back on ${remounted} times and crashed within 1 s of it ${k} times (${((100 * k) / Math.max(1, remounted)).toFixed(1)}%), ` +
    `within 2 s ${crashes.length} times (${intoCars} into cars${others.length ? `; ${others.join("; ")}` : ""}); ` +
    `within 1 s, one race in ${oneIn(n, k, 0)} (one standard error: ${oneIn(n, k + Math.sqrt(k), 0)} to ${oneIn(n, k - Math.sqrt(k), 0)})`
  );
}

/** Two runs as two samples (this less that): qualifying, the mean position of the races finished, and hits taken a race. */
function compare(a: readonly LoggedRace[], b: readonly LoggedRace[]) {
  const describe = (rows: readonly LoggedRace[]) => {
    const positions = rows.filter(finished).map((r) => r.pos ?? NaN);
    const hits = rows.map((r) => r.hitsAtMe);
    return { races: rows.length, n: positions.length, meanPosition: mean(positions), sd: sd(positions), q: rows.filter(qualified).length, hits: mean(hits), hitsSD: sd(hits) };
  };
  const A = describe(a);
  const B = describe(b);
  const pa = A.q / A.races;
  const pb = B.q / B.races;
  return {
    a: A,
    b: B,
    qualifiedPoints: 100 * (pa - pb),
    qualifiedPointsSE: 100 * Math.sqrt((pa * (1 - pa)) / A.races + (pb * (1 - pb)) / B.races),
    position: A.meanPosition - B.meanPosition,
    positionSE: Math.sqrt(A.sd ** 2 / A.n + B.sd ** 2 / B.n),
    hits: A.hits - B.hits,
    hitsSE: Math.sqrt(A.hitsSD ** 2 / A.races + B.hitsSD ** 2 / B.races),
  };
}

/** Two runs seed by seed (this less that): the mean change a race, with its standard error, and the races that ended differently. */
function paired(a: readonly LoggedRace[], b: readonly LoggedRace[]) {
  const bySeed = new Map(b.map((r) => [r.seed, r]));
  const pairs = a.flatMap((r) => {
    const other = bySeed.get(r.seed);
    return other ? [[r, other] as const] : [];
  });
  const change = (xs: number[], digits = 2) => {
    const n = xs.length;
    const m = xs.reduce((x, y) => x + y, 0) / n;
    const s = n > 1 ? Math.sqrt(xs.reduce((x, v) => x + (v - m) ** 2, 0) / (n - 1)) : NaN;
    return `${signed(m, digits)} (se ${(s / Math.sqrt(n)).toFixed(digits)}, n ${n})`;
  };
  const q = (r: LoggedRace) => (qualified(r) ? 1 : 0);
  const finishedBoth = pairs.filter(([x, y]) => finished(x) && finished(y));
  const differently = pairs.filter(([x, y]) => x.outcome !== y.outcome || x.pos !== y.pos || x.time !== y.time).length;
  return (
    `qualified a race ${change(pairs.map(([x, y]) => q(x) - q(y)))} [${pairs.reduce((s, [x]) => s + q(x), 0)}, ${pairs.reduce((s, [, y]) => s + q(y), 0)}]; ` +
    `position (finished in both) ${change(finishedBoth.map(([x, y]) => (x.pos ?? NaN) - (y.pos ?? NaN)))}; ` +
    `hits taken a race ${change(pairs.map(([x, y]) => x.hitsAtMe - y.hitsAtMe))}; ` +
    `time alone ${change(pairs.map(([x, y]) => x.aloneShare - y.aloneShare), 3)}; ` +
    `${differently} of ${pairs.length} races ended differently`
  );
}

function standing(rows: readonly LoggedRace[]) {
  const positions = rows
    .filter(finished)
    .map((r) => r.pos ?? NaN)
    .sort((a, b) => a - b);
  return {
    n: rows.length,
    q: rows.filter(qualified).length,
    wins: rows.filter((r) => finished(r) && r.pos === 1).length,
    meanPosition: mean(positions),
    positionSE: se(rows.filter(finished).map((r) => r.pos ?? NaN)),
    medianPosition: positions.length ? positions[Math.floor(positions.length / 2)] : NaN,
    range: positions.length ? `${positions[0]}-${positions[positions.length - 1]}` : "–",
  };
}

const finished = (r: LoggedRace) => r.outcome === "finished";
const qualified = (r: LoggedRace) => finished(r) && r.pos !== null && r.pos <= 3;
const knockOffs = (rows: readonly LoggedRace[]) => rows.reduce((a, r) => a + r.crashes["knocked-off"], 0);
/** The player's race was not over at the 7-minute cap. */
const neverEnded = (r: LoggedRace) => r.outcome === "unfinished";
const withoutATime = (rows: readonly LoggedRace[]) => rows.reduce((a, r) => a + (r.field ? r.field.noTime.length : (r.unplaced ?? 0)), 0);

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function sd(xs: readonly number[]) {
  const m = xs.reduce((x, y) => x + y, 0) / xs.length;
  return Math.sqrt(xs.reduce((x, v) => x + (v - m) ** 2, 0) / (xs.length - 1));
}
const se = (xs: readonly number[]) => sd(xs) / Math.sqrt(xs.length);

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");
const signed = (x: number, digits: number) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}` : "–");
const ordinal = (n: number) => (Number.isFinite(n) ? `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}` : "–");
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
/** One race in how many: `races` / `count`. */
const oneIn = (races: number, count: number, digits: number) => (count > 0 ? (races / count).toFixed(digits) : "∞");
