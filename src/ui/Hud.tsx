import { useEffect, useRef } from "react";
import type { GameSession } from "@/game/session";
import { PLAYER } from "@/race";
import { riderColours } from "@/renderer/rider-colours";
import { formatRaceTime, toKmh } from "./format";

/** How long "GO!" stays up after the countdown, in seconds of race time. */
const GO_SECONDS = 0.8;

/**
 * Position, speed, race time, progress along the track with a marker for
 * every rider, and the 3-2-1 countdown. It is updated straight from the frame
 * loop through refs, never through React state.
 */
export function Hud({ session }: { session: GameSession }) {
  const speed = useRef<HTMLSpanElement>(null);
  const position = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const countdown = useRef<HTMLDivElement>(null);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  const riders = session.view.current.riders;

  useEffect(
    () =>
      session.onFrame(({ track, current }) => {
        const player = current.riders[PLAYER];
        setText(speed.current, String(toKmh(player.speed)));
        setText(position.current, player.position === null ? "–" : String(player.position));
        setText(clock.current, formatRaceTime(current.clock));
        if (progress.current) progress.current.style.width = `${track.progressAt(player.distance) * 100}%`;
        for (const rider of current.riders) {
          const marker = markers.current[rider.id];
          if (marker) marker.style.left = `${track.progressAt(rider.distance) * 100}%`;
        }
        const call = current.countdown > 0 ? String(Math.ceil(current.countdown)) : current.clock < GO_SECONDS ? "GO!" : "";
        setText(countdown.current, call);
      }),
    [session],
  );

  return (
    <div className="pointer-events-none absolute inset-0 font-display text-sand">
      <div
        ref={countdown}
        data-testid="countdown"
        role="status"
        className="absolute inset-x-0 top-[28%] text-center text-9xl italic text-sun drop-shadow-[0_6px_0_rgba(27,16,38,0.85)] empty:hidden"
      />
      <div className="absolute left-8 top-4 drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]">
        <div className="text-sm uppercase tracking-widest text-sand/90">Position</div>
        <div data-testid="position" className="text-6xl italic leading-none tabular-nums">
          <span ref={position}>{riders.length}</span>
          <span className="text-3xl text-sand/80">/{riders.length}</span>
        </div>
      </div>
      <div className="absolute left-1/2 top-4 w-[min(36rem,60vw)] -translate-x-1/2">
        <div className="mb-1 flex justify-between text-sm uppercase tracking-widest text-sand/90 drop-shadow">
          <span>Start</span>
          <span ref={clock} data-testid="race-time" className="font-sans font-semibold tabular-nums" />
          <span>Finish</span>
        </div>
        <div data-testid="progress" className="relative h-3 rounded-full border border-sand/60 bg-night/60">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div ref={progress} className="h-full w-0 rounded-full bg-gradient-to-r from-sunset to-sun" />
          </div>
          {riders.map(({ id }) => (
            <div
              key={id}
              ref={(marker) => {
                markers.current[id] = marker;
              }}
              data-testid={id === PLAYER ? "player-marker" : "rider-marker"}
              className={
                id === PLAYER
                  ? "absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sand bg-sunset shadow"
                  : "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-night/80"
              }
              style={{ left: "0%", backgroundColor: id === PLAYER ? undefined : riderColours(id).bike }}
            />
          ))}
        </div>
      </div>
      <div className="absolute bottom-6 right-8 text-right drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]">
        <span ref={speed} data-testid="speed" className="text-7xl italic tabular-nums">
          0
        </span>
        <span className="ml-2 text-2xl uppercase">km/h</span>
      </div>
    </div>
  );
}

function setText(element: HTMLElement | null, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}
