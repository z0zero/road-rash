import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Difficulty } from "@/race";
import { BOT_NAMES, DIFFICULTIES } from "./bot";
import { measureCutIns } from "./cut-ins";
import { report } from "./report";
import { run } from "./run";
import { WHOLE_SET, type Job } from "./whole-set";

/**
 * The play-test's command line (README.md). playtest.mjs runs it once it has bundled the play-test with the Race
 * module to measure.
 */
const USAGE = `Usage: npm run playtest -- <what> [options]       (see tools/playtest/README.md)

  <difficulty> <bot> <pace> <seeds>   one run: a bot's races on those seeds, such as: normal racer 1.0 1-24
  cut-ins <difficulty> <seeds>        the cut-in measure, the racer at full pace, such as: hard 1-24
  all                                 the whole set behind the 1.1.0 release notes: ${WHOLE_SET.length} runs
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
  --jobs <n>        all: how many runs at a time (default ${defaultJobs()}, half the CPUs)`;

class UsageError extends Error {}

async function main(args: readonly string[]): Promise<number> {
  const { words, race, out = join("playtest-logs", (race ?? "working-tree").replace(/[^\w.-]/g, "-")), jobs = defaultJobs(), against } = parse(args);
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
    return runAll(out, jobs);
  }
  const job = jobOf(words);
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

/** Runs the whole set, `jobs` at a time, each in a process of its own running this same script. */
async function runAll(out: string, jobs: number): Promise<number> {
  const started = Date.now();
  const script = fileURLToPath(import.meta.url);
  const queue = [...WHOLE_SET];
  const failed: string[] = [];
  let done = 0;
  console.log(`The whole set: ${queue.length} runs, ${jobs} at a time, into ${out}`);
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const words = job.kind === "cut-ins" ? ["cut-ins", job.difficulty, `${job.first}-${job.last}`] : [job.difficulty, job.bot, job.pace, `${job.first}-${job.last}`];
      const { code, lastLine } = await runScript(script, [...words, "--out", out]);
      done++;
      const count = `[${String(done).padStart(2)}/${WHOLE_SET.length}]`;
      if (code === 0) console.log(`${count} ${lastLine}`);
      else {
        failed.push(nameOf(job));
        console.log(`${count} ${nameOf(job)} FAILED (exit ${code})`);
      }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  console.log(`${WHOLE_SET.length - failed.length} of ${WHOLE_SET.length} runs in ${minutes(Date.now() - started)}, logs in ${out}`);
  if (failed.length) console.log(`Failed: ${failed.join("; ")}`);
  return failed.length ? 1 : 0;
}

/** The runs under way, each in a process of its own: a signal to stop is passed on to them. */
const running = new Set<ChildProcess>();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const child of running) child.kill(signal);
    process.exit(1);
  });
}

/** Runs this script with `args` in a new process, keeping the last line it prints. */
function runScript(script: string, args: readonly string[]) {
  return new Promise<{ code: number; lastLine: string }>((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "inherit"] });
    running.add(child);
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (text = (text + chunk).slice(-4000)));
    child.on("close", (code) => {
      running.delete(child);
      resolve({ code: code ?? 1, lastLine: text.trim().split("\n").pop() ?? "" });
    });
  });
}

function parse(args: readonly string[]) {
  const words: string[] = [];
  const against: string[] = [];
  let race: string | undefined;
  let out: string | undefined;
  let jobs: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    const value = () => {
      const next = args[++i];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`${word} needs a value`);
      return next;
    };
    if (word === "--race") race = value();
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
  return { words, race, out, jobs, against };
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

const nameOf = (job: Job) =>
  `${job.difficulty[0].toUpperCase()}${job.difficulty.slice(1)} ${job.kind === "cut-ins" ? "cut-ins" : `${job.bot} ${job.pace}`}, seeds ${job.first}-${job.last}`;

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
  if (!(error instanceof UsageError)) throw error;
  console.error(`${error.message}\n\n${USAGE}`);
  process.exitCode = 2;
}
