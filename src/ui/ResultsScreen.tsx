import type { RaceOutcome, RaceResults } from "@/race";
import type { PersonalBest } from "@/save-data/save-data";
import { Button } from "./Button";
import { formatRaceTime } from "./format";

const BANNERS: Record<RaceOutcome, string> = { finished: "Finished", wrecked: "Wrecked", busted: "Busted" };

export function ResultsScreen({
  results,
  personalBest,
  newBestTime,
  onRestart,
  onTitle,
}: {
  results: RaceResults;
  personalBest: PersonalBest;
  newBestTime: boolean;
  onRestart: () => void;
  onTitle: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
      className="absolute inset-0 flex items-center justify-center bg-night/55 backdrop-blur-[2px]"
    >
      <div className="flex w-[min(30rem,90vw)] flex-col items-center gap-5 rounded-xl border border-sun/40 bg-night/85 px-10 py-8 shadow-2xl">
        <h2 id="results-title" className="font-display text-6xl uppercase italic tracking-wide text-sun">
          {BANNERS[results.outcome]}
        </h2>
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-lg">
          <dt className="text-sand/80">Race time</dt>
          <dd data-testid="results-time" className="text-right font-semibold tabular-nums text-sand">
            {results.time === null ? "–" : formatRaceTime(results.time)}
          </dd>
          <dt className="text-sand/80">Personal best</dt>
          <dd data-testid="personal-best" className="text-right font-semibold tabular-nums text-sand">
            {personalBest.time === null ? "–" : formatRaceTime(personalBest.time)}
          </dd>
        </dl>
        {newBestTime && <p className="font-display text-2xl uppercase italic text-sunset">New personal best!</p>}
        <div className="flex flex-col gap-3">
          <Button autoFocus onClick={onRestart}>
            Restart
          </Button>
          <Button onClick={onTitle}>Back to title</Button>
        </div>
      </div>
    </div>
  );
}
