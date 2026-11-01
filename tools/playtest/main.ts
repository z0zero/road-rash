import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { availableParallelism, constants } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Difficulty } from "@/race";
import { BOT_NAMES, DIFFICULTIES } from "./bot";
import { measureCutIns } from "./cut-ins";
import { Refusal } from "./logs";
import { report } from "./report";
import { run } from "./run";
import { nameOf, WHOLE_SET, type Job } from "./whole-set";

/**
 * The play-test's command line (README.md). playtest.mjs runs it once it has bundled the play-test with the Race
 * module to measure.
 */
const USAGE = `Usage: npm run playtest -- <what> [options]       (see tools/playtest/README.md)

  <difficulty> <bot> <pace> <seeds>   one run: a bot's races on those seeds, such as: normal racer 1.0 1-24
  cut-ins <difficulty> <seeds>        the cut-in measure, the racer at full pace, such as: hard 1-24
  all                                 the whole set behind the 1.1.0 release notes: ${WHOLE_SET.length} runs, but for
                                      those whose logs are already there
  report <logs>... [--against <logs>...]
                                      the release notes' claims from logs (folders or files);
                                      npm run playtest:report -- <logs>... does the same

  difficulty: easy, normal or hard
  bot: racer, counter (the counter-puncher) or brawler
  pace: the bot's share of a safe pace, such as 0.75 or 1.0
  seeds: <first>-<last>, such as 1-24, or one seed

Options:
  --race <commit>   ride that commit's Race module (src/race) instead of this checkout's
  --out <folder>    where the logs go: playtest-logs/<commit>, or playtest-logs/working-tree, unless given
  --jobs <n>        all: how many runs at a time (default ${defaultJobs()}, half the CPUs)
  --redo            all: ride the runs whose logs are already there again`;

class UsageError extends Error {}

/**
 * Set by playtest.mjs to the commit it bundled when that commit's Race module has no difficulties, as before 2c512c8
 * (v1.0.0, say): such a race is Normal's whatever it is asked for.
 */
const WITHOUT_DIFFICULTIES = process.env.PLAYTEST_RACE_WITHOUT_DIFFICULTIES;

async function main(args: readonly string[]): Promise<number> {
  const { words, race, out = join("playtest-logs", (race ?? "working-tree").replace(/[^\w.-]/g, "-")), jobs = defaultJobs(), against, redo } = parse(args);
  const [what, ...rest] = words;
  if (what === undefined || what === "help" || what === "--help") {
    console.log(USAGE);
    return 0;
  }
  if (what === "report") {
    if (!rest.length) throw new UsageError("Which logs? Give a folder of logs, or log files.");
    const missing = [...rest, ...against].find((path) => !existsSync(path));
    if (missing) throw new UsageError(`No log or folder ${missing}`);
    for (const line of report(rest, against)) console.log(line);
    return 0;
  }
  if (what === "all") {
    if (rest.length) throw new UsageError(`all takes no more words: ${rest.join(" ")}`);
    return runAll(out, jobs, redo);
  }
  const job = jobOf(words);
  if (WITHOUT_DIFFICULTIES && job.difficulty !== "normal") {
    throw new Refusal(`${WITHOUT_DIFFICULTIES} has no difficulties (they came in 2c512c8): its one race is Normal's, so ride it on normal, not ${job.difficulty}.`);
  }
  const started = Date.now();
  const file = logFile(out, job);
  if (job.kind === "cut-ins") {
    const summary = measureCutIns(job, file, (seed, outcome) => console.log(`seed ${seed}: ${outcome ?? "unfinished at the 7-minute cap"}`));
    console.log(`${nameOf(job)}: ${summary.replace(/^SUMMARY [^:]*: /, "")} (${minutes(Date.now() - started)}) ${file}`);
    return 0;
  }
  const summary = run(job, file, (row) =>
    console.log(`seed ${row.seed}: ${row.outcome === "unfinished" ? "unfinished at the 7-minute cap" : row.outcome}${row.pos !== null ? ` ${ordinal(row.pos)}` : ""}${row.time !== null ? ` in ${row.time} s` : ""}`),
  );
  console.log(`${nameOf(job)}: qualified ${summary.qualified} of ${summary.races}, positions ${summary.positions || "none"} (${minutes(Date.now() - started)}) ${file}`);
  return 0;
}

/**
 * Runs the whole set, `jobs` at a time, each in a process of its own running this same script, leaving out the runs
 * whose logs are already in `out` unless `redo`. On a commit without difficulties it runs only the Normal runs. Ctrl+C
 * or SIGTERM stops the runs under way, waits for them to end and runs no more: each leaves its log's .part file.
 */
async function runAll(out: string, jobs: number, redo: boolean): Promise<number> {
  const started = Date.now();
  const script = fileURLToPath(import.meta.url);
  const set = WITHOUT_DIFFICULTIES ? WHOLE_SET.filter((job) => job.difficulty === "normal") : WHOLE_SET;
  const there = redo ? [] : set.filter((job) => existsSync(logFile(out, job)));
  const queue = set.filter((job) => !there.includes(job));
  const total = queue.length;
  const failed: string[] = [];
  let done = 0;
  if (WITHOUT_DIFFICULTIES) {
    console.log(`${WITHOUT_DIFFICULTIES} has no difficulties (they came in 2c512c8): its one race is Normal's, so only the whole set's ${set.length} Normal runs are ridden.`);
  }
  if (there.length) console.log(`${there.length} of the ${set.length} runs already have their logs in ${out}, so they are left as they are (--redo rides them again).`);
  if (!total) return 0;
  console.log(`The whole set: ${runs(total)}, ${Math.min(jobs, total)} at a time, into ${out}`);

  const running = new Set<ChildProcess>();
  let stoppedBy: NodeJS.Signals | undefined;
  const stop = (signal: NodeJS.Signals) => {
    stoppedBy ??= signal;
    queue.length = 0;
    for (const child of running) child.kill(signal);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const words = job.kind === "cut-ins" ? ["cut-ins", job.difficulty, `${job.first}-${job.last}`] : [job.difficulty, job.bot, job.pace, `${job.first}-${job.last}`];
      const { code, signal, lastLine } = await runScript(script, [...words, "--out", out], running);
      // Ctrl+C reaches the runs as well, and may end one before this process hears of it.
      if (signal === "SIGINT" || signal === "SIGTERM") stop(signal);
      if (stoppedBy && code !== 0) continue;
      done++;
      const count = `[${String(done).padStart(2)}/${total}]`;
      if (code === 0) console.log(`${count} ${lastLine}`);
      else {
        failed.push(nameOf(job));
        console.log(`${count} ${nameOf(job)} FAILED (exit ${code})`);
      }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  if (stoppedBy) {
    console.log(`Stopped by ${stoppedBy} after ${done} of ${runs(total)} (${minutes(Date.now() - started)}). A run cut short leaves its log's .part file; npm run playtest -- all rides it again.`);
    return 128 + constants.signals[stoppedBy];
  }
  console.log(`${total - failed.length} of ${runs(total)} in ${minutes(Date.now() - started)}, logs in ${out}`);
  if (failed.length) console.log(`Failed: ${failed.join("; ")}`);
  return failed.length ? 1 : 0;
}

/** Runs this script with `args` in a new process, in `running` while it runs, keeping the last line it prints. */
function runScript(script: string, args: readonly string[], running: Set<ChildProcess>) {
  return new Promise<{ code: number; signal: NodeJS.Signals | null; lastLine: string }>((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "inherit"] });
    running.add(child);
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (text = (text + chunk).slice(-4000)));
    child.on("close", (code, signal) => {
      running.delete(child);
      resolve({ code: code ?? (signal ? 128 + constants.signals[signal] : 1), signal, lastLine: text.trim().split("\n").pop() ?? "" });
    });
  });
}

function parse(args: readonly string[]) {
  const words: string[] = [];
  const against: string[] = [];
  let race: string | undefined;
  let out: string | undefined;
  let jobs: number | undefined;
  let redo = false;
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    const value = () => {
      const next = args[++i];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`${word} needs a value`);
      return next;
    };
    if (word === "--race") race = value();
    else if (word === "--redo") redo = true;
    else if (word === "--out") out = value();
    else if (word === "--jobs") {
      jobs = Number(value());
      if (!Number.isInteger(jobs) || jobs < 1) throw new UsageError("--jobs takes a whole number, 1 or more");
    } else if (word === "--against") {
      while (args[i + 1] !== undefined && !args[i + 1].startsWith("--")) against.push(args[++i]);
      if (!against.length) throw new UsageError("--against needs logs");
    } else if (word.startsWith("--") && word !== "--help") throw new UsageError(`Unknown option ${word}`);
    else words.push(word);
  }
  return { words, race, out, jobs, against, redo };
}

function jobOf(words: readonly string[]): Job {
  if (words[0] === "cut-ins") {
    if (words.length !== 3) throw new UsageError("cut-ins takes a difficulty and seeds, such as: cut-ins hard 1-24");
    return { kind: "cut-ins", difficulty: difficultyOf(words[1]), ...seedsOf(words[2]) };
  }
  if (words.length !== 4) throw new UsageError(`A run takes a difficulty, a bot, a pace and seeds, such as: normal racer 1.0 1-24`);
  const [difficulty, bot, pace, seeds] = words;
  const botName = BOT_NAMES.find((b) => b === bot);
  if (!botName) throw new UsageError(`No bot ${bot}: racer, counter or brawler`);
  if (!/^\d+(\.\d+)?$/.test(pace) || !(Number(pace) > 0 && Number(pace) <= 2)) throw new UsageError(`The pace is a share of a safe pace, such as 0.75 or 1.0, not ${pace}`);
  return { kind: "run", difficulty: difficultyOf(difficulty), bot: botName, pace, ...seedsOf(seeds) };
}

function difficultyOf(word: string): Difficulty {
  const difficulty = DIFFICULTIES.find((d) => d === word);
  if (!difficulty) throw new UsageError(`No difficulty ${word}: easy, normal or hard`);
  return difficulty;
}

function seedsOf(word: string) {
  const match = /^(\d+)(?:-(\d+))?$/.exec(word);
  const first = Number(match?.[1]);
  const last = Number(match?.[2] ?? match?.[1]);
  if (!match || last < first) throw new UsageError(`Seeds are <first>-<last>, such as 1-24, or one seed, not ${word}`);
  return { first, last };
}

/** Where a job's log goes: its seeds' folder, its difficulty's, then the bot and pace, or cut-ins. */
function logFile(out: string, job: Job) {
  return join(out, `seeds-${job.first}-${job.last}`, job.difficulty, job.kind === "cut-ins" ? "cut-ins.log" : `${job.bot}-${job.pace}.log`);
}

/** A number of runs, such as 1 run or 35 runs. */
const runs = (n: number) => `${n} run${n === 1 ? "" : "s"}`;

/** A time as minutes and seconds, such as 2:05. */
function minutes(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

function defaultJobs() {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

// Last, once everything above is defined.
try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Refusal) {
    console.error(error.message);
    process.exitCode = 1;
  } else if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else throw error;
}
