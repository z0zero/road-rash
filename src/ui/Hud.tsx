import { useEffect, useRef, type RefObject } from "react";
import type { GameSession } from "@/game/session";
import { PLAYER, type RiderSnapshot } from "@/race";
import { liveryOf } from "@/renderer/liveries";
import { formatRaceTime, toKmh } from "./format";

/** How long "GO!" stays up after the countdown, in seconds of race time. */
const GO_SECONDS = 0.8;

/** Stamina and condition run from 0 to this. */
const FULL = 100;

/**
 * Position, speed, race time, progress along the track with a marker for
 * every rider, the 3-2-1 countdown, the player's stamina and bike condition,
 * the nearest opponent's name and stamina, and warning arrows for riders
 * alongside or coming up from behind. It is updated straight from the frame
 * loop through refs, never through React state.
 */
export function Hud({ session }: { session: GameSession }) {
  const speed = useRef<HTMLSpanElement>(null);
  const position = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const countdown = useRef<HTMLDivElement>(null);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  const stamina = useRef<HTMLDivElement>(null);
  const condition = useRef<HTMLDivElement>(null);
  const opponent = useRef<HTMLDivElement>(null);
  const opponentName = useRef<HTMLDivElement>(null);
  const opponentStamina = useRef<HTMLDivElement>(null);
  const warnLeft = useRef<HTMLDivElement>(null);
  const warnRight = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const riders = session.view.current.riders;

  useEffect(
    () =>
      session.onFrame(({ track, current }) => {
        const player = current.riders[PLAYER];
        setText(speed.current, String(toKmh(player.bike.speed)));
        setText(position.current, player.position === null ? "–" : String(player.position));
        setText(clock.current, formatRaceTime(current.clock));
        if (progress.current) progress.current.style.width = `${track.progressAt(player.distance) * 100}%`;
        for (const rider of current.riders) {
          const marker = markers.current[rider.id];
          if (marker) marker.style.left = `${track.progressAt(rider.distance) * 100}%`;
        }
        const call = current.countdown > 0 ? String(Math.ceil(current.countdown)) : current.clock < GO_SECONDS ? "GO!" : "";
        setText(countdown.current, call);
        setBar(stamina.current, player.stamina, staminaColour);
        setBar(condition.current, player.condition, conditionColour);
        const nearest = current.nearestOpponent === null ? null : current.riders[current.nearestOpponent];
        setShown(opponent.current, nearest !== null);
        if (nearest) {
          setText(opponentName.current, nearest.name);
          setBar(opponentStamina.current, nearest.stamina, staminaColour);
        }
        setShown(warnLeft.current, current.warnings.left);
        setShown(warnRight.current, current.warnings.right);
        setText(status.current, statusOf(player));
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
      <div
        ref={status}
        data-testid="rider-status"
        className="absolute inset-x-0 top-[40%] text-center text-4xl uppercase italic text-sunset drop-shadow-[0_4px_0_rgba(27,16,38,0.85)] empty:hidden"
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
              style={{ left: "0%", backgroundColor: id === PLAYER ? undefined : liveryOf(id).paint }}
            />
          ))}
        </div>
      </div>
      <div
        ref={opponent}
        data-testid="nearest-opponent"
        className="absolute right-8 top-4 hidden w-56 text-right drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]"
      >
        <div className="text-sm uppercase tracking-widest text-sand/90">Nearest</div>
        <div ref={opponentName} data-testid="nearest-opponent-name" className="truncate text-3xl italic leading-tight" />
        <Bar fill={opponentStamina} label="Their stamina" />
      </div>
      <div className="absolute bottom-6 left-8 flex w-64 flex-col gap-2 drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]">
        <div>
          <div className="text-sm uppercase tracking-widest text-sand/90">Stamina</div>
          <Bar fill={stamina} label="Stamina" testId="stamina" />
        </div>
        <div>
          <div className="text-sm uppercase tracking-widest text-sand/90">Bike</div>
          <Bar fill={condition} label="Bike condition" testId="condition" />
        </div>
      </div>
      <div className="absolute bottom-6 right-8 text-right drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]">
        <span ref={speed} data-testid="speed" className="text-7xl italic tabular-nums">
          0
        </span>
        <span className="ml-2 text-2xl uppercase">km/h</span>
      </div>
      <div
        ref={warnLeft}
        data-testid="warning-left"
        aria-label="Rider on your left"
        className="absolute left-3 top-1/2 hidden -translate-y-1/2 animate-pulse text-7xl text-sunset drop-shadow-[0_4px_0_rgba(27,16,38,0.85)]"
      >
        ◀
      </div>
      <div
        ref={warnRight}
        data-testid="warning-right"
        aria-label="Rider on your right"
        className="absolute right-3 top-1/2 hidden -translate-y-1/2 animate-pulse text-7xl text-sunset drop-shadow-[0_4px_0_rgba(27,16,38,0.85)]"
      >
        ▶
      </div>
    </div>
  );
}

/** A meter from 0 to 100 whose fill the frame loop sizes and colours. */
function Bar({ fill, label, testId }: { fill: RefObject<HTMLDivElement | null>; label: string; testId?: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={FULL}
      aria-valuenow={FULL}
      data-testid={testId}
      className="mt-1 h-3.5 overflow-hidden rounded-sm border border-sand/70 bg-night/70"
    >
      <div ref={fill} className="h-full w-full" />
    </div>
  );
}

/** What the player is doing, if they are off their bike. */
function statusOf(player: RiderSnapshot): string {
  if (player.status !== "racing") return "";
  if (player.crash === "tumbling") return "Crash!";
  if (player.crash === "on-foot") return "Back to your bike!";
  return "";
}

/** Green when fresh, yellow when tiring, red when nearly out. */
function staminaColour(share: number): string {
  return share > 0.6 ? "#6fd36a" : share > 0.3 ? "#ffc94d" : "#ff4d3d";
}

/** Steel blue while sound, orange when battered, red when nearly wrecked. */
function conditionColour(share: number): string {
  return share > 0.6 ? "#7fb6e0" : share > 0.3 ? "#ff7a3d" : "#ff4d3d";
}

function setBar(fill: HTMLDivElement | null, value: number, colour: (share: number) => string) {
  if (!fill) return;
  const share = Math.max(0, Math.min(1, value / FULL));
  const width = `${(share * 100).toFixed(1)}%`;
  if (fill.style.width !== width) fill.style.width = width;
  const background = colour(share);
  if (fill.dataset.colour !== background) {
    fill.dataset.colour = background;
    fill.style.backgroundColor = background;
  }
  const meter = fill.parentElement;
  const now = String(Math.round(value));
  if (meter && meter.getAttribute("aria-valuenow") !== now) meter.setAttribute("aria-valuenow", now);
}

function setShown(element: HTMLElement | null, shown: boolean) {
  if (element && element.classList.contains("hidden") === shown) element.classList.toggle("hidden", !shown);
}

function setText(element: HTMLElement | null, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}
