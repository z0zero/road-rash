import type { Difficulty } from "@/race";
import { BOT_NAMES, DIFFICULTIES, type BotName } from "./bot";
import { capital, paceText, readLogs, type CutInLog, type LoggedRace, type RunLog } from "./logs";
import { nameOf, WHOLE_SET } from "./whole-set";

/**
 * The 1.2.0 release notes' measured claims (CHANGELOG.md), from the logs in `paths`, each claim in the notes' words
 * with the numbers behind it; with `against`, the same runs in other logs, such as another commit's, set beside them.
 * Returns the report's lines. The notes' numbers come from the whole set and the extra runs README.md lists, set beside
 * 1.1.0's, and the slower players' from their own runs.
 */
export function report(paths: readonly string[], against: readonly string[]): string[] {
  const logs = readLogs(paths);
  const base = against.length ? readLogs(against) : null;
  const runs = runsOf(logs.runs);
  const baseRuns = base ? runsOf(base.runs) : null;
  const runOf = (difficulty: Difficulty, bot: BotName, pace: number) => runs.get(keyOf(difficulty, bot, pace)) ?? [];
  const there = against.join(", ");
  const out = [
    "# The 1.2.0 release notes' measured claims",
    "",
    `From ${logs.runs.length} run logs and ${logs.cutIns.length} cut-in logs in ${paths.join(", ")}. ± is one standard error.`,
    "A run's seed ranges are given apart, then together.",
    "",
    wholeSetIn(logs),
  ];
  /** A section: a claim in the notes' words, then the numbers behind it, with a note on them, if any of its runs are in the logs. */
  const section = (heading: string, lines: readonly string[], note?: string) => {
    out.push("", `## ${heading}`, "");
    if (note && lines.length) out.push(note, "");
    out.push(...(lines.length ? lines : ["- (none of its runs is in these logs)"]));
  };
  const each = (difficulty: Difficulty, bot: BotName, pace: number, say: (races: Races) => string, label = `${bot} ${paceText(pace)}`) =>
    blocks(runOf(difficulty, bot, pace)).map(([seeds, races]) => `- ${label}, seeds ${seeds}: ${say(races)}`);
  /** The same run in the other logs, as `each` gives it here. */
  const eachThere = (difficulty: Difficulty, bot: BotName, pace: number, say: (races: Races) => string, label = `${bot} ${paceText(pace)}`) =>
    blocks(baseRuns?.get(keyOf(difficulty, bot, pace)) ?? []).map(([seeds, races]) => `- in ${there}, ${label}, seeds ${seeds}: ${say(races)}`);
  /** A run's seed ranges taken together (1-48, 1-72), each race set beside the same seed's in the other logs. */
  const eachPaired = (difficulty: Difficulty, bot: BotName, pace: number, label = `${bot} ${paceText(pace)}`) => {
    const theirs = baseRuns?.get(keyOf(difficulty, bot, pace)) ?? [];
    return blocks(runOf(difficulty, bot, pace)).flatMap(([seeds, races]) => {
      const others = onSeeds(theirs, races.rows);
      return races.logs.length > 1 && others.length === races.rows.length ? [`- ${label} against ${there}, seeds ${seeds}, seed by seed: ${paired(races.rows, others)}`] : [];
    });
  };

  const all = racesIn(logs.runs);
  const whole = wholeSetRaces(logs.runs);
  const baseAll = base ? racesIn(base.runs) : [];
  const baseWhole = base ? wholeSetRaces(base.runs) : [];
  /** A line on the whole set's races here, then, if the other logs have them, one on theirs. */
  const wholeSet = (say: (races: readonly Ridden[]) => string) =>
    whole.length ? [`- the whole set's ${whole.length} races: ${say(whole)}`, ...(baseWhole.length ? [`- in ${there}, the whole set's ${baseWhole.length} races: ${say(baseWhole)}`] : [])] : [];

  section("Riding: in 768 bot races, crashing again within a second of getting back on went from 26 times to 8.", wholeSet(remounts));

  section(
    "Riding: in 768 bot races, opponents ran into cops 4 times, against 37 in 1.1.0.",
    wholeSet((races) => `opponents ran into cops ${byDifficulty(races, (r) => r.opp.cop ?? 0)} times`),
  );

  section(
    "Riding: in 144 races of the expert racer bot at full speed, no opponent cut across it, against 20 times in 18 races in 1.1.0.",
    cutIns(logs.cutIns),
    "The cut-in measure: the racer at full pace, and its run-ins with opponents, by who moved across into whom in the half second before.",
  );
  if (base?.cutIns.length) out.push("", `In ${there}:`, "", ...cutIns(base.cutIns));

  section(
    "Riding: in 768 bot races, opponents crashed into a rider 243 times, against 721 in 1.1.0, and the player crashed into an opponent 126 times, against 250.",
    wholeSet((races) => `opponents crashed into a rider ${byDifficulty(races, (r) => r.opp.rider ?? 0)} times, and the player into an opponent ${byDifficulty(races, (r) => r.crashes.rider)} times`),
  );

  section("Easy: a first-timer (riding at 75% of a safe pace) still finishes about 8th on average (8.6), seldom alone (13% of the race) and never knocked off.", [
    ...each("easy", "racer", FIRST_TIMER, firstTimer),
    ...eachThere("easy", "racer", FIRST_TIMER, firstTimer),
  ]);

  section("Easy: an average rider qualifies in two races of three or a little more (35 of 48).", each("easy", "racer", 0.85, qualifying));

  section(
    "Easy: the better bots qualify more often than in 1.1.0: 120 of their 144 Easy races, on 24 seeds, against 97.",
    qualifiers(whole, baseWhole, "easy", there, [keyOf("easy", "racer", FIRST_TIMER), keyOf("easy", "racer", 0.85)]),
    "Every Easy run of the whole set. The better bots are all but the first-timer (racer 0.75) and the average rider (racer 0.85).",
  );

  const normal = [...each("normal", "racer", 0.92, qualifying, "racer 0.92 (a decent rider)"), ...each("normal", "racer", 1, qualifying, "racer 1.0 (an expert)")];
  if (baseRuns) {
    const totals = new Map<string, { q: number; n: number; baseQ: number }>();
    normal.push("", `Every Normal run against ${there}, as two samples (this less that):`, "");
    for (const [key, logsHere] of runs) {
      const theirs = baseRuns.get(key);
      if (logsHere[0].difficulty !== "normal" || !theirs) continue;
      for (const [seeds, races] of blocks(logsHere)) {
        const others = onSeeds(theirs, races.rows);
        if (others.length < races.rows.length) continue;
        normal.push(`- ${key.slice("normal ".length)}, seeds ${seeds}: ${twoSamples(races.rows, others)}`);
        // Totals over one log's seeds at a time, such as every run's seeds 1-24.
        if (races.logs.length > 1) continue;
        const t = totals.get(seeds) ?? { q: 0, n: 0, baseQ: 0 };
        totals.set(seeds, { q: t.q + races.rows.filter(qualified).length, n: t.n + races.rows.length, baseQ: t.baseQ + others.filter(qualified).length });
      }
    }
    for (const [seeds, t] of totals) normal.push(`- every Normal run above, seeds ${seeds}: ${t.q} of ${t.n} qualified, against ${t.baseQ}`);
  } else if (normal.length) normal.push("", "(Give v1.0.0's or 1.1.0's Normal runs with --against to set these beside them.)");
  section(
    "Normal: qualifying is as in 1.0.0 and 1.1.0, within the play-test's noise (73 of 192 races on seeds 1-24, against 75 and 77), and the expert finishes a little higher (2.3 on average over 72 seeds, against 3.2).",
    normal,
  );

  section(
    "Hard: an expert qualifies in about three races of five (28 of 48, and 41 of 72), against 21 of 48 and 32 of 72 in 1.1.0, a difference within the play-test's noise.",
    [...each("hard", "racer", 1, qualifying), ...eachThere("hard", "racer", 1, qualifying), ...eachPaired("hard", "racer", 1)],
  );

  section("Hard: one who hits back takes no more hits and qualifies about as often: over 72 seeds, 4.4 hits a race against 4.8, and 35 races qualified against 41.", [
    ...each("hard", "racer", 1, fighting),
    ...each("hard", "counter", 1, fighting),
    ...against2("counter-puncher against racer at 1.0", runOf("hard", "counter", 1), runOf("hard", "racer", 1)),
  ]);

  section(
    "Hard: at a slower pace, one who hits back takes fewer hits (6.1 against 7.3 a race, over 72 seeds).",
    [0.92, 0.85].flatMap((pace) => [
      ...each("hard", "racer", pace, fighting),
      ...each("hard", "counter", pace, fighting),
      ...against2(`counter-puncher against racer at ${pace}`, runOf("hard", "counter", pace), runOf("hard", "racer", pace)),
    ]),
  );

  const hard = (races: readonly Ridden[]) => races.filter(({ log }) => log.difficulty === "hard");
  const notBrawler = (races: readonly Ridden[]) => races.filter(({ log }) => log.bot !== "brawler");
  section(
    "Hard: a club still can't knock you off from full stamina: in 264 Hard races, the racer and the counter-puncher bots were knocked off 5 times, each time after their stamina had run out.",
    [
      ...(hard(whole).length ? [`- the whole set's Hard races of the racer and the counter-puncher: ${knockOffs(notBrawler(hard(whole)))}`] : []),
      ...(hard(baseWhole).length ? [`- in ${there}, the same races: ${knockOffs(notBrawler(hard(baseWhole)))}`] : []),
      ...(all.length > whole.length ? [`- every Hard run here: ${knockOffs(hard(all))}`] : []),
      ...(baseAll.length > baseWhole.length ? [`- every Hard run in ${there}: ${knockOffs(hard(baseAll))}`] : []),
    ],
    "The racer never hits back; the counter-puncher hits back; the brawler starts fights.",
  );

  const both = base ? inBoth(logs.runs, base.runs) : [];
  section(
    "Known limitation: a cop riding to bust you brakes no harder than the riders behind it can, and no longer cuts across a car's path to get out of their way, so it reaches you sooner after a crash, and some crashes you got away from in 1.1.0 now end in a bust: 54 of the 1,344 bot races ridden on both ended in a bust, against 33 in 1.1.0.",
    base
      ? both.length
        ? [
            `- every race in both, ${both.length}: busted ${byDifficulty(both, busted)} times, against ${byDifficulty(theirsOf(both), busted)} in ${there}; ` +
              `${both.filter(({ row, other }) => busted(row) > busted(other)).length} races busted here and not there, ${both.filter(({ row, other }) => busted(row) < busted(other)).length} there and not here`,
          ]
        : ["- (no race is in both)"]
      : all.length
        ? [`- every race here, ${all.length}: busted ${byDifficulty(all, busted)} times (give 1.1.0's runs with --against to set these beside them)`]
        : [],
  );

  section(
    "Known limitation: getting back on just as a car comes past can still crash you again, about one race in 100 (8 in 768 bot races, against 26 in 1.1.0). With a cop riding to bust you close by, you don't wait for the car: 9 of the 10 such crashes in 1,344 bot races came that way, and each of those races ended in a bust.",
    [
      ...wholeSet(remounts),
      ...(all.length > whole.length ? [`- every run here, ${all.length} races: ${remounts(all)}`] : []),
      ...(baseAll.length > baseWhole.length ? [`- every run in ${there}, ${baseAll.length} races: ${remounts(baseAll)}`] : []),
    ],
    "How near the cop was isn't in the logs; how each of those races ended is.",
  );

  section(
    "Known limitation: in bot races, though, opponents crashed into cars less than in 1.1.0: 263 times in 768, against 382.",
    wholeSet((races) => `opponents crashed into cars ${byDifficulty(races, (r) => r.opp.traffic ?? 0)} times`),
  );

  const slower = [...runs.values()].filter((these) => these[0].difficulty === "easy" && these[0].bot === "racer" && these[0].pace < FIRST_TIMER);
  section(
    "Known limitation: a player much slower than a first-timer has little chance on Easy, as in 1.1.0: riding at 60% of a safe pace, the racer bot finished last or not at all in all 48 races, and at 65% in 42 of 48.",
    slower.flatMap((these) => {
      const theirs = baseRuns?.get(keyOf("easy", "racer", these[0].pace));
      const others = theirs ? onSeeds(theirs, these.flatMap((l) => l.rows)) : [];
      return [
        ...blocks(these).map(([seeds, races]) => `- racer ${paceText(these[0].pace)}, seeds ${seeds}: ${lastOrNot(races.rows)}`),
        ...(others.length ? [`- in ${there}, racer ${paceText(these[0].pace)}, seeds ${seedsOf(others)}: ${lastOrNot(others)}`] : []),
      ];
    }),
  );

  if (baseRuns) {
    const pairs = [...runs].flatMap(([key, logsHere]) => {
      const mine = logsHere.flatMap((l) => l.rows);
      const theirs = onSeeds(baseRuns.get(key) ?? [], mine);
      return theirs.length ? [`- ${key}, seeds ${seedsOf(theirs)}: ${paired(mine, theirs)}`] : [];
    });
    section(
      `Against ${there}: every run in both, seed by seed`,
      pairs.length ? pairs : ["- (no run is in both)"],
      "This less that, each race set beside the same seed's: the mean change a race, with its standard error. A race the same in both counts as no change.",
    );
  }
  return out;
}

/** Which of the whole set's runs (whole-set.ts) the logs lack: those without a log of every one of the run's seeds. */
function wholeSetIn({ runs, cutIns }: ReturnType<typeof readLogs>) {
  const missing = WHOLE_SET.filter((job) => {
    const seeds = new Set(
      job.kind === "cut-ins"
        ? cutIns.filter((l) => l.difficulty === job.difficulty).flatMap((l) => l.races.map((r) => r.seed))
        : runs.filter((l) => l.difficulty === job.difficulty && l.bot === job.bot && l.pace === Number(job.pace)).flatMap((l) => l.rows.map((r) => r.seed)),
    );
    return Array.from({ length: job.last - job.first + 1 }, (_, i) => job.first + i).some((seed) => !seeds.has(seed));
  });
  return missing.length
    ? `Of the whole set's ${WHOLE_SET.length} runs, ${missing.length === 1 ? "1 is not here, or not on all its seeds" : `${missing.length} are not here, or not on all their seeds`}: ${missing.map(nameOf).join("; ")}.`
    : `All ${WHOLE_SET.length} of the whole set's runs are here.`;
}

/** A race of a run, with its run's log. */
interface Ridden {
  readonly row: LoggedRace;
  readonly log: RunLog;
}

/** Every race of `logs`, with its log. */
const racesIn = (logs: readonly RunLog[]): Ridden[] => logs.flatMap((log) => log.rows.map((row) => ({ row, log })));

/** The races of `logs` that the whole set rides (whole-set.ts): its runs, on their seeds. */
const wholeSetRaces = (logs: readonly RunLog[]) =>
  racesIn(logs).filter(({ row, log }) =>
    WHOLE_SET.some((job) => job.kind === "run" && job.difficulty === log.difficulty && job.bot === log.bot && Number(job.pace) === log.pace && row.seed >= job.first && row.seed <= job.last),
  );

/** Every race of `mine` that `theirs` has too, the same run on the same seed, with the other's row. */
function inBoth(mine: readonly RunLog[], theirs: readonly RunLog[]) {
  const id = ({ row, log }: Ridden) => `${keyOf(log.difficulty, log.bot, log.pace)} ${row.seed}`;
  const others = new Map(racesIn(theirs).map((race) => [id(race), race.row]));
  return racesIn(mine).flatMap((race) => {
    const other = others.get(id(race));
    return other ? [{ ...race, other }] : [];
  });
}

/** The other logs' races of `pairs`. */
const theirsOf = (pairs: readonly (Ridden & { readonly other: LoggedRace })[]): Ridden[] => pairs.map(({ other, log }) => ({ row: other, log }));

/** A count over races, then the same by difficulty: "4 (Easy 1, Normal 2, Hard 1)". */
function byDifficulty(races: readonly Ridden[], count: (row: LoggedRace) => number) {
  const total = (these: readonly Ridden[]) => these.reduce((a, { row }) => a + count(row), 0);
  const parts = DIFFICULTIES.filter((d) => races.some(({ log }) => log.difficulty === d)).map((d) => `${capital(d)} ${total(races.filter(({ log }) => log.difficulty === d))}`);
  return `${total(races)} (${parts.join(", ")})`;
}

/** The pace the notes call a first-timer's. */
const FIRST_TIMER = 0.75;

/** The place of the last of the field: fourteen opponents and the player. */
const LAST = 15;

const keyOf = (difficulty: Difficulty, bot: BotName, pace: number) => `${difficulty} ${bot} ${paceText(pace)}`;

/** The logs of each run (difficulty, bot and pace), by their first seed (readLogs makes sure no two share a seed). */
function runsOf(logs: readonly RunLog[]) {
  const runs = new Map<string, RunLog[]>();
  for (const log of logs) {
    const key = keyOf(log.difficulty, log.bot, log.pace);
    const these = runs.get(key) ?? [];
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

/**
 * A run's logs one by one, labelled by their seeds, then, if there is more than one, the first two together, the first
 * three, and so on: seeds 1-24, 25-48 and 49-72, then 1-48 and 1-72.
 */
function blocks(logs: readonly RunLog[]): [string, Races][] {
  const racesOf = (these: readonly RunLog[]): Races => ({
    logs: these,
    rows: these.flatMap((l) => l.rows),
    aloneShare: mean(these.map((l) => l.aloneShare)),
    within10Share: mean(these.map((l) => l.within10Share)),
  });
  const each = logs.map((l): [string, Races] => [seedsOf(l.rows), racesOf([l])]);
  const together: [string, Races][] = [];
  for (let n = 2; n <= logs.length; n++) together.push([seedsOf(logs.slice(0, n).flatMap((l) => l.rows)), racesOf(logs.slice(0, n))]);
  return [...each, ...together];
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
    `knock-offs ${knockOffCount(races.rows)} in ${races.rows.length}`
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
  return `${s.q} of ${s.n} qualified; mean position ${f1(s.meanPosition)} ± ${f1(s.positionSE)}; hits taken ${f1(mean(hits))} ± ${f1(se(hits))} a race; knock-offs ${f2(knockOffCount(races.rows) / s.n)} a race`;
}

/**
 * Each of a difficulty's runs in `mine` (the whole set's races), its qualifiers set beside those of the same races in
 * `theirs`, then every run but those `apart` together, then all of them.
 */
function qualifiers(mine: readonly Ridden[], theirs: readonly Ridden[], difficulty: Difficulty, there: string, apart: readonly string[] = []) {
  const here = mine.filter(({ log }) => log.difficulty === difficulty);
  const others = theirs.filter(({ log }) => log.difficulty === difficulty);
  const keyOfRace = ({ log }: Ridden) => keyOf(log.difficulty, log.bot, log.pace);
  const count = (races: readonly Ridden[]) => races.filter(({ row }) => qualified(row)).length;
  const keys = [...new Set(here.map(keyOfRace))].sort((a, b) => order(a) - order(b));
  const against = (races: readonly Ridden[]) => (races.length ? `, against ${count(races)} of ${races.length} in ${there}` : "");
  const rest = (races: readonly Ridden[]) => races.filter((race) => !apart.includes(keyOfRace(race)));
  return [
    ...keys.map((key) => {
      const these = here.filter((race) => keyOfRace(race) === key);
      return `- ${key.slice(difficulty.length + 1)}, seeds ${seedsOf(these.map(({ row }) => row))}: ${count(these)} of ${these.length} qualified${against(others.filter((race) => keyOfRace(race) === key))}`;
    }),
    ...(apart.length && rest(here).length
      ? [`- every ${capital(difficulty)} run of the whole set but ${apart.map((key) => key.slice(difficulty.length + 1)).join(" and ")}: ${count(rest(here))} of ${rest(here).length} qualified${against(rest(others))}`]
      : []),
    ...(here.length ? [`- every ${capital(difficulty)} race of the whole set: ${count(here)} of ${here.length} qualified${against(others)}`] : []),
  ];
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
  return mine.length ? [`- ${what}, seeds ${seedsOf(mine)}: ${twoSamples(mine, theirs)}; knock-offs ${knockOffCount(mine)} and ${knockOffCount(theirs)}`] : [];
}

/** The cut-in logs, a difficulty at a time, then all together. */
function cutIns(logs: readonly CutInLog[]) {
  const order = (log: CutInLog) => DIFFICULTIES.indexOf(log.difficulty);
  const lines = [...logs]
    .sort((a, b) => order(a) - order(b) || (a.races[0]?.seed ?? 0) - (b.races[0]?.seed ?? 0))
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
      `- all: ${logs.reduce((a, l) => a + l.runIns.length, 0)} run-ins, ${logs.reduce((a, l) => a + l.runIns.filter((r) => r.who === "they moved across into me").length, 0)} with the opponent moving across into the racer; ` +
        `${cut.length} strict cut-across in ${inRaces} races of ${races}: one race in ${oneIn(races, inRaces, 0)} (one in ${oneIn(races, cut.length, 1)} counting each cut-across)`,
    );
  }
  return lines;
}

/** The player's remounts, their crashes within 1 s and 2 s of one (the logs list those within 2 s), and how the races with one within 1 s ended. */
function remounts(races: readonly Ridden[]) {
  const counted = races.filter(({ row }) => row.remountCount !== undefined);
  if (!counted.length) return "(no log records remounts)";
  const remounted = counted.reduce((a, { row }) => a + (row.remountCount?.player ?? 0), 0);
  const crashes = counted.flatMap(({ row, log }) => (row.remountCrashes ?? []).filter((c) => c.who === "player").map((c) => ({ ...c, row, log })));
  const intoCars = crashes.filter((c) => c.cause === "traffic").length;
  const others = crashes.filter((c) => c.cause !== "traffic").map((c) => `${c.after} s after, into ${c.with || c.cause}, in ${capital(c.log.difficulty)} ${c.log.bot} ${paceText(c.log.pace)} seed ${c.row.seed}`);
  // A race in how many, with the count's standard error (√k) carried over: between n/(k+√k) and n/(k-√k).
  const soon = crashes.filter((c) => c.after <= 1);
  const k = soon.length;
  const n = counted.length;
  const withOne = [...new Set(soon.map((c) => c.row))];
  return (
    `the player got back on ${remounted} times and crashed within 1 s of it ${k} times (${((100 * k) / Math.max(1, remounted)).toFixed(1)}%), ` +
    `within 2 s ${crashes.length} times (${intoCars} into cars${others.length ? `; ${others.join("; ")}` : ""}); ` +
    `within 1 s, one race in ${oneIn(n, k, 0)} (one standard error: ${oneIn(n, k + Math.sqrt(k), 0)} to ${oneIn(n, k - Math.sqrt(k), 0)}); ` +
    `${withOne.filter((r) => busted(r) > 0).length} of the ${withOne.length} races with a crash within 1 s ended in a bust`
  );
}

/** Knock-offs in Hard races, by bot and pace, and those in races whose stamina never ran out. */
function knockOffs(races: readonly Ridden[]) {
  const rows = races.map(({ row }) => row);
  const byBot = BOT_NAMES.flatMap((bot) => {
    const these = races.filter(({ log }) => log.bot === bot);
    const paces = [...new Set(these.map(({ log }) => log.pace))].sort((a, b) => a - b);
    const at = (pace: number) => these.filter(({ log }) => log.pace === pace).map(({ row }) => row);
    return these.length ? [`${bot} ${knockOffCount(these.map(({ row }) => row))} in ${these.length} (${paces.map((p) => `${paceText(p)}: ${knockOffCount(at(p))} in ${at(p).length}`).join(", ")})`] : [];
  });
  return (
    `knocked off ${knockOffCount(rows)} times in ${rows.length} races: ${byBot.join("; ")}; ` +
    `in races whose stamina never ran out, ${knockOffCount(rows.filter((r) => r.minStamina > 0))}`
  );
}

/** A slow run's races: how many it finished last or not at all, and how. */
function lastOrNot(rows: readonly LoggedRace[]) {
  const last = rows.filter((r) => finished(r) && r.pos === LAST).length;
  const how = (outcome: LoggedRace["outcome"]) => rows.filter((r) => r.outcome === outcome).length;
  return (
    `finished last or not at all in ${rows.filter((r) => !finished(r) || r.pos === LAST).length} of ${rows.length} ` +
    `(last ${last}, busted ${how("busted")}, wrecked ${how("wrecked")}, never ended ${how("unfinished")}); qualified ${rows.filter(qualified).length}`
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
const busted = (r: LoggedRace) => (r.outcome === "busted" ? 1 : 0);
const knockOffCount = (rows: readonly LoggedRace[]) => rows.reduce((a, r) => a + r.crashes["knocked-off"], 0);

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
/** One race in how many: `races` / `count`. */
const oneIn = (races: number, count: number, digits: number) => (count > 0 ? (races / count).toFixed(digits) : "∞");
