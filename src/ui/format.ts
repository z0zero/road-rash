/** Speed for the screen: the simulation's metres per second in whole km/h. */
export function toKmh(metresPerSecond: number): number {
  return Math.round(metresPerSecond * 3.6);
}

/** A race time like a stopwatch shows it: minutes, seconds and hundredths, e.g. "2:41.07". */
export function formatRaceTime(seconds: number): string {
  const hundredths = Math.floor(seconds * 100 + 1e-6);
  const minutes = Math.floor(hundredths / 6000);
  const wholeSeconds = Math.floor((hundredths % 6000) / 100);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}`;
}
