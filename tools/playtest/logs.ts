import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Difficulty } from "@/race";
import { BOT_NAMES, DIFFICULTIES, type BotName } from "./bot";
import type { RunIn } from "./cut-ins";
import type { RaceRow } from "./run";

/** A reason the play-test stops, such as two logs of the same races, told in one line without a stack trace. */
export class Refusal extends Error {}

/** A run's log: its bot, pace and difficulty, from its SUMMARY line, and its races. */
export interface RunLog {
  readonly file: string;
  readonly bot: BotName;
  readonly pace: number;
  readonly difficulty: Difficulty;
  readonly rows: readonly LoggedRace[];
  /** The SUMMARY's shares of the player's race: with no opponent racing within 50 m, and with one within 10 m. */
  readonly aloneShare: number;
  readonly within10Share: number;
}

/** A race's row as a log gives it. Logs made before 1.1.0's play-test, such as v1.0.0's racer runs, lack the remounts. */
export type LoggedRace = Omit<RaceRow, "remountCount" | "remountCrashes"> & Partial<Pick<RaceRow, "remountCount" | "remountCrashes">>;

/** A cut-in measure's log: its run-ins, and a line for each race. */
export interface CutInLog {
  readonly file: string;
  readonly difficulty: Difficulty;
  readonly runIns: readonly RunIn[];
  readonly races: readonly { readonly seed: number }[];
}

/**
 * Every log in `paths`, each a log or a folder searched for *.log files: run logs and cut-in logs, told apart by
 * their SUMMARY line. Files without one, such as a run that is still going, are left out with a note on stderr. Two
 * logs of the same races (a run's, or a difficulty's cut-ins, on a seed both have) are refused, since they would count
 * those races twice.
 */
export function readLogs(paths: readonly string[]) {
  const runs: RunLog[] = [];
  const cutIns: CutInLog[] = [];
  /** The log each run's, or each difficulty's cut-ins', seeds are in, by the run and the seed. */
  const logOf = new Map<string, string>();
  const once = (what: string, seeds: readonly number[], file: string) => {
    for (const seed of seeds) {
      const other = logOf.get(`${what} ${seed}`);
      if (other !== undefined && other !== file) {
        throw new Refusal(
          `Seed ${seed} of ${what} is in two logs, ${other} and ${file}. The report reads every log in the folders it is given, so keep a try on other seeds in a folder of its own (--out).`,
        );
      }
      logOf.set(`${what} ${seed}`, file);
    }
  };
  for (const file of paths.flatMap(logsIn)) {
    const lines = readFileSync(file, "utf8").split("\n");
    const summary = lines.find((l) => l.startsWith("SUMMARY "));
    if (!summary) {
      console.error(`(${file} has no SUMMARY line, so it is left out)`);
      continue;
    }
    const json = (l: string): unknown => JSON.parse(l);
    if (summary.startsWith("SUMMARY {")) {
      const s = json(summary.slice(8)) as { mode: string; cfg: string; opts: string; aloneShare: number; within10Share: number };
      const { pace } = json(s.cfg) as { pace: number };
      const opts = json(s.opts) as { difficulty?: string };
      const difficulty = DIFFICULTIES.find((d) => d === (opts.difficulty ?? "normal"));
      const bot = BOT_NAMES.find((b) => b === s.mode);
      if (!bot || typeof pace !== "number" || !difficulty) throw new Refusal(`${file}: not a play-test run's SUMMARY`);
      const rows = lines.filter((l) => l.startsWith("{")).map((l) => json(l) as LoggedRace);
      if (rows.some((r) => typeof r.seed !== "number" || typeof r.outcome !== "string")) throw new Refusal(`${file}: a row without a seed or an outcome`);
      once(`${capital(difficulty)} ${bot} ${paceText(pace)}`, rows.map((r) => r.seed), file);
      runs.push({ file, bot, pace, difficulty, rows, aloneShare: s.aloneShare, within10Share: s.within10Share });
    } else {
      const difficulty = DIFFICULTIES.find((d) => d === summary.split(" ")[1]);
      if (!difficulty) throw new Refusal(`${file}: not a cut-in measure's SUMMARY`);
      const runIns = lines.filter((l) => l.startsWith("{")).map((l) => json(l) as RunIn);
      const races = lines.filter((l) => l.startsWith("RACE ")).map((l) => json(l.slice(5)) as { seed: number });
      once(`${capital(difficulty)} cut-ins`, races.map((r) => r.seed), file);
      cutIns.push({ file, difficulty, runIns, races });
    }
  }
  return { runs, cutIns };
}

function logsIn(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((name) => {
      const inner = join(path, name);
      return statSync(inner).isDirectory() ? logsIn(inner) : name.endsWith(".log") ? [inner] : [];
    });
}

export const capital = (word: string) => word[0].toUpperCase() + word.slice(1);
/** A pace as the command line and the logs' names give it, such as 1.0 or 0.92. */
export const paceText = (pace: number) => (Number.isInteger(pace) ? pace.toFixed(1) : String(pace));
