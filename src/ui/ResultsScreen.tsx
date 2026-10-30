import { useEffect, useRef, useState } from "react";
import { codesOf, KEYS } from "@/input/bindings";
import {
  PLAYER,
  QUALIFYING_POSITION,
  type Difficulty,
  type RaceOutcome,
  type RaceResults,
  type Remark,
  type Standing,
} from "@/race";
import { liveryOf } from "@/renderer/liveries";
import type { PersonalBest } from "@/save-data/save-data";
import { Button } from "./Button";
import { difficultyName, formatPosition, formatRaceTime } from "./format";
import { PANEL, PANEL_TITLE } from "./panel";
import { RaceSeed } from "./RaceSeed";

const BANNERS: Record<RaceOutcome, string> = { finished: "Finished", wrecked: "Wrecked", busted: "Busted" };

/**
 * The buttons can't be pressed, or take the focus, until this long after the
 * results come up (milliseconds), when Restart takes the focus unless the
 * player has already moved it to a button. A gamepad's A presses the button
 * in focus and its B goes back to the title, but A is also a throttle and B
 * a kick, so a rider still pressing them as the race ends, or pushing the
 * stick that moves the focus, would otherwise leave the results before they
 * had read them. Esc goes back to the title from then on too.
 */
const FOCUS_RESTART_AFTER_MS = 1500;

const BACK = codesOf(KEYS.back);

/** Restart shows its focus ring when it takes the focus, so it is clear what A or Enter will press. */
const SHOW_FOCUS: FocusOptions & { focusVisible: boolean } = { focusVisible: true };

export function ResultsScreen({
  results,
  personalBest,
  newBestTime,
  newBestPosition,
  seed,
  difficulty,
  onRestart,
  onTitle,
}: {
  results: RaceResults;
  /** The personal best on the race's difficulty, this race counted. */
  personalBest: PersonalBest;
  newBestTime: boolean;
  newBestPosition: boolean;
  /** The race's seed, shown for a bug report. */
  seed: number;
  /** The race's difficulty, shown with its seed. */
  difficulty: Difficulty;
  onRestart: () => void;
  onTitle: () => void;
}) {
  const newBests = [newBestTime && "time", newBestPosition && "position"].filter(Boolean).join(" and ");
  const restart = useRef<HTMLButtonElement>(null);
  const buttons = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const readying = window.setTimeout(() => setReady(true), FOCUS_RESTART_AFTER_MS);
    return () => window.clearTimeout(readying);
  }, []);
  useEffect(() => {
    if (ready && !buttons.current?.contains(document.activeElement)) restart.current?.focus(SHOW_FOCUS);
  }, [ready]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-night/55 p-4 backdrop-blur-[2px]"
      onKeyDown={(event) => {
        if (ready && BACK.includes(event.code)) onTitle();
      }}
    >
      <div className={`flex w-[min(52rem,94vw)] flex-col gap-6 px-8 py-7 md:flex-row md:gap-10 ${PANEL}`}>
        <div className="flex flex-col items-center gap-4 md:w-72 md:shrink-0">
          <h2 id="results-title" className={`text-6xl ${PANEL_TITLE}`}>
            {BANNERS[results.outcome]}
          </h2>
          <p
            data-testid="qualified"
            className={`font-display text-3xl uppercase italic ${results.qualified ? "text-sunset" : "text-sand/70"}`}
          >
            {results.qualified ? "Qualified!" : "Not qualified"}
          </p>
          {!results.qualified && results.outcome === "finished" && (
            <p className="-mt-3 text-sm text-sand/70">Finish {formatPosition(QUALIFYING_POSITION)} or better to qualify.</p>
          )}
          {results.remark ? (
            <SaidAfterTheRace remark={results.remark} />
          ) : (
            <p data-testid="racing-on" className="w-full border-l-4 border-sand/30 py-0.5 pl-4 text-left text-lg italic text-sand/70">
              The rest of the field is racing to the finish&hellip;
            </p>
          )}
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-lg">
            <dt className="text-sand/80">Position</dt>
            <dd data-testid="results-position" className="text-right font-semibold tabular-nums text-sand">
              {results.position === null ? "–" : `${formatPosition(results.position)} of ${results.standings.length}`}
            </dd>
            <dt className="text-sand/80">Race time</dt>
            <dd data-testid="results-time" className="text-right font-semibold tabular-nums text-sand">
              {results.time === null ? "–" : formatRaceTime(results.time)}
            </dd>
            <dt className="text-sand/80">Best on {difficultyName(difficulty)}</dt>
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
          <div ref={buttons} inert={!ready} className="flex flex-col gap-3">
            <Button ref={restart} onClick={onRestart}>
              Restart
            </Button>
            <Button data-back onClick={onTitle}>Back to title</Button>
          </div>
          <RaceSeed seed={seed} difficulty={difficulty} />
        </div>
        <Standings standings={results.standings} complete={results.complete} />
      </div>
    </div>
  );
}

/**
 * The remark on the player's race, as a quote, with who said it: an opponent
 * beside their colours, or a cop beside the red and blue of a light bar.
 */
function SaidAfterTheRace({ remark }: { remark: Remark }) {
  return (
    <figure data-testid="remark" className="w-full border-l-4 border-sunset/80 py-0.5 pl-4 text-left">
      <blockquote className="text-lg italic leading-snug text-sand">&ldquo;{remark.line}&rdquo;</blockquote>
      <figcaption className="mt-1.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-sunset">
        {remark.by.kind === "rider" ? (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-sand/70"
            style={{ backgroundColor: liveryOf(remark.by.id).paint }}
          />
        ) : (
          <span aria-hidden="true" className="flex shrink-0 gap-0.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cop-red" />
            <span className="h-2.5 w-2.5 rounded-full bg-cop-blue" />
          </span>
        )}
        {remark.name}
      </figcaption>
    </figure>
  );
}

/**
 * Every rider's final position and time, the player's row picked out. Until
 * the standings are `complete`, riders still racing to the finish have no
 * position yet, and say so.
 */
function Standings({ standings, complete }: { standings: readonly Standing[]; complete: boolean }) {
  return (
    <table data-testid="standings" aria-busy={!complete} className="w-full self-start text-sm tabular-nums">
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
        {standings.map((standing) => {
          const onTheWay = !complete && standing.status === "racing";
          return (
            <tr
              key={standing.rider}
              className={
                standing.rider === PLAYER
                  ? "bg-sunset/25 font-semibold text-sun"
                  : !onTheWay && standing.position !== null && standing.position <= QUALIFYING_POSITION
                    ? "text-sand"
                    : "text-sand/80"
              }
            >
              <td className="py-0.5 pl-1">{standing.position === null || onTheWay ? "–" : formatPosition(standing.position)}</td>
              <th scope="row" className="py-0.5 text-left font-[inherit]">
                {standing.name}
              </th>
              <td className="py-0.5 pr-1 text-right">{onTheWay ? "Racing…" : finish(standing)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A finishing time, how the rider's race ended, or a dash for a rider still riding when the fast-forward ran out of time. */
function finish(standing: Standing) {
  if (standing.time !== null) return formatRaceTime(standing.time);
  if (standing.status === "wrecked") return "Wrecked";
  if (standing.status === "busted") return "Busted";
  return "–";
}
