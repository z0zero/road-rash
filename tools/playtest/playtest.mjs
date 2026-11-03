// @ts-check
/**
 * Runs the play-test (README.md): bundles its TypeScript (main.ts and what it imports) with a Race module, this
 * checkout's src/race or, with --race <commit>, that commit's, into one script in a temporary folder, and runs the
 * script with the same arguments, in the folder npm was run from. A commit whose Race module has no difficulties, as
 * before 2c512c8, is named to the script in PLAYTEST_RACE_WITHOUT_DIFFICULTIES, so it rides only Normal's race.
 *
 * It bundles with rolldown, which the repository has through vitest's vite, rather than add a TypeScript runner: the
 * races then run as plain JavaScript, as fast as anywhere, and the play-test needs no dependency of its own.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rolldown } from "rolldown";

const ROOT = join(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const race = args.includes("--race") ? args[args.indexOf("--race") + 1] : undefined;

/**
 * Ctrl+C or SIGTERM: passed on to the script, which stops at once (or, running the whole set, stops its runs and waits
 * for them), and this waits for it to end, then clears its folder. Before the script starts, nothing is run. npm passes
 * a SIGTERM only to the shell it runs this in, so this stops as for one when that shell is gone.
 * @type {import("node:child_process").ChildProcess | undefined}
 */
let child;
/** @type {NodeJS.Signals | undefined} */
let stoppedBy;
/** @param {NodeJS.Signals} signal */
const stop = (signal) => {
  stoppedBy ??= signal;
  child?.kill(signal);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const parent = process.ppid;
const orphaned = setInterval(() => {
  if (process.ppid === parent) return;
  clearInterval(orphaned);
  stop("SIGTERM");
}, 250).unref();

const folder = mkdtempSync(join(tmpdir(), "playtest-"));
try {
  const script = join(folder, "playtest.mjs");
  const src = race ? snapshotOf(race, folder) : join(ROOT, "src");
  if (race && !existsSync(join(src, "race", "difficulty.ts"))) process.env.PLAYTEST_RACE_WITHOUT_DIFFICULTIES = race;
  await bundle(src, script);
  process.exitCode = stoppedBy ? 128 + constants.signals[stoppedBy] : await runScript(script, args);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(folder, { recursive: true, force: true });
}

/**
 * Bundles the play-test into `script`, with `@/` naming `src`: the folder whose race/ it rides. Rolldown is told to
 * leave tsconfig.json alone, whose paths would name this checkout's.
 * @param {string} src
 * @param {string} script
 */
async function bundle(src, script) {
  const build = await rolldown({ input: join(import.meta.dirname, "main.ts"), platform: "node", resolve: { alias: { "@": src } }, tsconfig: false });
  try {
    await build.write({ file: script, format: "esm" });
  } finally {
    await build.close();
  }
}

/**
 * Copies `commit`'s src/race into `folder`, and returns the folder's src.
 * @param {string} commit
 * @param {string} folder
 */
function snapshotOf(commit, folder) {
  /** @param {string[]} gitArgs */
  const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
  let files;
  try {
    files = git("ls-tree", "-r", "--name-only", `${commit}^{commit}`, "--", "src/race").split("\n").filter(Boolean);
  } catch {
    throw new Error(`No commit ${commit} in this repository`);
  }
  if (!files.length) throw new Error(`${commit} has no src/race`);
  for (const file of files) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), git("show", `${commit}:${file}`));
  }
  return join(folder, "src");
}

/**
 * Runs `script` with `scriptArgs` in a new process, and resolves to its exit code: 128 and the signal's number if a
 * signal ended it.
 * @param {string} script
 * @param {string[]} scriptArgs
 * @returns {Promise<number>}
 */
function runScript(script, scriptArgs) {
  child = spawn(process.execPath, [script, ...scriptArgs], { stdio: "inherit", cwd: process.env.INIT_CWD ?? process.cwd() });
  return new Promise((resolve) =>
    child?.on("close", (code, signal) => resolve(code ?? (signal ? 128 + constants.signals[signal] : 1))),
  );
}
