import { PLAYER, type RaceOutcome, type RaceResults, type Remark, type Standing } from "@/race";
import { liveryOf } from "@/renderer/liveries";
import type { PersonalBest } from "@/save-data/save-data";
import { Button } from "./Button";
import { formatPosition, formatRaceTime } from "./format";

const BANNERS: Record<RaceOutcome, string> = { finished: "Finished", wrecked: "Wrecked", busted: "Busted" };

export function ResultsScreen({
  results,
  personalBest,
  newBestTime,
  newBestPosition,
  onRestart,
  onTitle,
}: {
  results: RaceResults;
  personalBest: PersonalBest;
  newBestTime: boolean;
  newBestPosition: boolean;
  onRestart: () => void;
  onTitle: () => void;
}) {
  const newBests = [newBestTime && "time", newBestPosition && "position"].filter(Boolean).join(" and ");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-night/55 p-4 backdrop-blur-[2px]"
    >
      <div className="flex w-[min(52rem,94vw)] flex-col gap-6 rounded-xl border border-sun/40 bg-night/85 px-8 py-7 shadow-2xl md:flex-row md:gap-10">
        <div className="flex flex-col items-center gap-4 md:w-72 md:shrink-0">
          <h2 id="results-title" className="font-display text-6xl uppercase italic tracking-wide text-sun">
            {BANNERS[results.outcome]}
          </h2>
          <p
            data-testid="qualified"
            className={`font-display text-3xl uppercase italic ${results.qualified ? "text-sunset" : "text-sand/70"}`}
          >
            {results.qualified ? "Qualified!" : "Not qualified"}
          </p>
          {!results.qualified && results.outcome === "finished" && (
            <p className="-mt-3 text-sm text-sand/70">Finish 3rd or better to qualify.</p>
          )}
          <SaidAfterTheRace remark={results.remark} />
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-lg">
            <dt className="text-sand/80">Position</dt>
            <dd data-testid="results-position" className="text-right font-semibold tabular-nums text-sand">
              {results.position === null ? "–" : `${formatPosition(results.position)} of ${results.standings.length}`}
            </dd>
            <dt className="text-sand/80">Race time</dt>
            <dd data-testid="results-time" className="text-right font-semibold tabular-nums text-sand">
              {results.time === null ? "–" : formatRaceTime(results.time)}
            </dd>
            <dt className="text-sand/80">Personal best</dt>
            <dd data-testid="personal-best" className="text-right font-semibold tabular-nums text-sand">
              {personalBest.time === null ? "–" : formatRaceTime(personalBest.time)}
            </dd>
            <dt className="text-sand/80">Best position</dt>
            <dd data-testid="best-position" className="text-right font-semibold tabular-nums text-sand">
              {personalBest.position === null ? "–" : formatPosition(personalBest.position)}
            </dd>
          </dl>
          {newBests && (
            <p className="text-center font-display text-2xl uppercase italic text-sunset">New best {newBests}!</p>
          )}
          <div className="flex flex-col gap-3">
            <Button autoFocus onClick={onRestart}>
              Restart
            </Button>
            <Button onClick={onTitle}>Back to title</Button>
          </div>
        </div>
        <Standings standings={results.standings} />
      </div>
    </div>
  );
}

/** The remark on the player's race, as a quote, with who said it: an opponent beside their colours, or a cop. */
function SaidAfterTheRace({ remark }: { remark: Remark }) {
  return (
    <figure data-testid="remark" className="w-full border-l-4 border-sunset/80 py-0.5 pl-4 text-left">
      <blockquote className="text-lg italic leading-snug text-sand">&ldquo;{remark.line}&rdquo;</blockquote>
      <figcaption className="mt-1.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-sunset">
        {remark.by.kind === "rider" && (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-sand/70"
            style={{ backgroundColor: liveryOf(remark.by.id).paint }}
          />
        )}
        {remark.name}
      </figcaption>
    </figure>
  );
}

/** Every rider's final position and time, the player's row picked out. */
function Standings({ standings }: { standings: readonly Standing[] }) {
  return (
    <table data-testid="standings" className="w-full self-start text-sm tabular-nums">
      <caption className="mb-2 text-left font-display text-2xl uppercase italic tracking-wide text-sun">Standings</caption>
      <thead>
        <tr className="text-left text-xs uppercase tracking-widest text-sand/60">
          <th scope="col" className="w-14 py-1 font-normal">
            Pos
          </th>
          <th scope="col" className="py-1 font-normal">
            Rider
          </th>
          <th scope="col" className="py-1 text-right font-normal">
            Time
          </th>
        </tr>
      </thead>
      <tbody>
        {standings.map((standing) => (
          <tr
            key={standing.rider}
            className={
              standing.rider === PLAYER
                ? "bg-sunset/25 font-semibold text-sun"
                : standing.position !== null && standing.position <= 3
                  ? "text-sand"
                  : "text-sand/80"
            }
          >
            <td className="py-0.5 pl-1">{standing.position === null ? "–" : formatPosition(standing.position)}</td>
            <th scope="row" className="py-0.5 text-left font-[inherit]">
              {standing.name}
            </th>
            <td className="py-0.5 pr-1 text-right">{finish(standing)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A finishing time, how the rider's race ended, or a dash for a rider still riding when the results were drawn up. */
function finish(standing: Standing) {
  if (standing.time !== null) return formatRaceTime(standing.time);
  if (standing.status === "wrecked") return "Wrecked";
  if (standing.status === "busted") return "Busted";
  return "–";
}
