import type { Difficulty } from "@/race";

/** Speed for the screen: the simulation's metres per second in whole km/h. */
export function toKmh(metresPerSecond: number): number {
  return Math.round(metresPerSecond * 3.6);
}

/** The ordinal suffixes that aren't "th", by a number's last digit. */
const ORDINAL_SUFFIXES: Readonly<Record<number, string>> = { 1: "st", 2: "nd", 3: "rd" };

/** A position as an English ordinal: "1st", "2nd", "3rd", "4th", ..., "11th", "12th", "13th". */
export function formatPosition(position: number): string {
  const lastTwo = position % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : (ORDINAL_SUFFIXES[position % 10] ?? "th");
  return `${position}${suffix}`;
}

/** A race time like a stopwatch shows it: minutes, seconds and hundredths, e.g. "2:41.07". */
export function formatRaceTime(seconds: number): string {
  const hundredths = Math.floor(seconds * 100 + 1e-6);
  const minutes = Math.floor(hundredths / 6000);
  const wholeSeconds = Math.floor((hundredths % 6000) / 100);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}`;
}

/** What each difficulty is called on screen. */
const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** A difficulty's name on screen: "Easy", "Normal" or "Hard". */
export function difficultyName(difficulty: Difficulty): string {
  return DIFFICULTY_NAMES[difficulty];
}
