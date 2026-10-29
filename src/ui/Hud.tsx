import { useEffect, useRef, type RefObject } from "react";
import type { GameSession } from "@/game/session";
import { COP_FULL_STAMINA, PLAYER, type RaceEvent, type RaceSnapshot, type RiderSnapshot } from "@/race";
import { liveryOf } from "@/renderer/liveries";
import { ClubIcon } from "./ClubIcon";
import { formatRaceTime, toKmh } from "./format";

/** How long "GO!" stays up after the countdown, in seconds of race time. */
const GO_SECONDS = 0.8;

/** How long a callout, such as a club changing hands, stays up, in seconds of race time. */
const CALLOUT_SECONDS = 1.8;

/** Stamina and condition run from 0 to this. */
const FULL = 100;

/**
 * Position, speed, race time, progress along the track with a marker for
 * every rider, the 3-2-1 countdown, the player's stamina and bike condition,
 * a club icon while the player holds one, the nearest opponent's (or
 * cop's) name, stamina and club, warning arrows for riders alongside or
 * coming up from behind, the cop alert while a cop is near (its lights
 * flashing unless motion is reduced), and callouts when a club changes hands
 * with the player or a cop fights back, goes down or busts someone. It is
 * updated straight from the frame loop through refs, never through React state.
 */
export function Hud({ session, reduceMotion }: { session: GameSession; reduceMotion: boolean }) {
  const speed = useRef<HTMLSpanElement>(null);
  const position = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const countdown = useRef<HTMLDivElement>(null);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  const stamina = useRef<HTMLDivElement>(null);
  const condition = useRef<HTMLDivElement>(null);
  const nearestPanel = useRef<HTMLDivElement>(null);
  const nearestName = useRef<HTMLDivElement>(null);
  const nearestStamina = useRef<HTMLDivElement>(null);
  const warnLeft = useRef<HTMLDivElement>(null);
  const warnRight = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const playerClub = useRef<HTMLDivElement>(null);
  const nearestClub = useRef<HTMLSpanElement>(null);
  const nearestIsCop = useRef<HTMLSpanElement>(null);
  const copAlert = useRef<HTMLDivElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  /** The stretch of race time the callout shows for. */
  const calloutShown = useRef({ from: 0, until: 0 });
  /** Whether the player last went down because a car knocked them down while on foot, rather than in a crash. */
  const knockedDown = useRef(false);
  const riders = session.view.current.riders;

  useEffect(
    () =>
      session.onRaceEvent((event) => {
        if (event.type === "crash" && event.rider === PLAYER) knockedDown.current = false;
        if (event.type === "knocked-down" && event.rider === PLAYER) knockedDown.current = true;
        const text = calloutFor(event, session.view.current);
        if (!text) return;
        setText(callout.current, text);
        const { clock } = session.view.current;
        calloutShown.current = { from: clock, until: clock + CALLOUT_SECONDS };
      }),
    [session],
  );

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
        const nearest = current.nearestOpponentOrCop;
        setShown(nearestPanel.current, nearest !== null);
        if (nearest) {
          const isCop = nearest.kind === "cop";
          const them = isCop ? current.cops[nearest.id] : current.riders[nearest.id];
          setText(nearestName.current, them.name);
          setBar(nearestStamina.current, them.stamina, staminaColour, isCop ? COP_FULL_STAMINA : FULL);
          setShown(nearestClub.current, them.weapon === "club");
          setShown(nearestIsCop.current, isCop);
        }
        setShown(warnLeft.current, current.warnings.left);
        setShown(warnRight.current, current.warnings.right);
        setShown(copAlert.current, current.cops.some((cop) => cop.near));
        const copComing = current.cops.some((cop) => cop.busting === PLAYER);
        setText(status.current, statusOf(player, knockedDown.current, copComing));
        setShown(playerClub.current, player.weapon === "club");
        // A callout goes once its time is up, or straight away in a race that has started over.
        const { from, until } = calloutShown.current;
        if (current.clock >= until || current.clock < from) setText(callout.current, "");
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
      <div
        ref={callout}
        data-testid="callout"
        role="status"
        className="absolute inset-x-0 top-[46%] text-center text-3xl italic text-sun drop-shadow-[0_3px_0_rgba(27,16,38,0.85)] empty:hidden"
      />
      <div
        ref={copAlert}
        data-testid="cop-alert"
        role="status"
        aria-label="A cop is near"
        className="absolute left-1/2 top-[4.75rem] hidden -translate-x-1/2"
      >
        <div className="flex items-center gap-3 rounded-full border-2 border-sand/80 bg-night/80 px-4 py-1 shadow-lg">
          <span
            className={`h-4 w-4 rounded-full bg-[#ff2a3d] shadow-[0_0_14px_4px_#ff2a3d] ${reduceMotion ? "" : "animate-cop-red"}`}
          />
          <span className="text-3xl uppercase italic leading-none tracking-wide text-sand">Cop</span>
          <span
            className={`h-4 w-4 rounded-full bg-[#2a7dff] shadow-[0_0_14px_4px_#2a7dff] ${reduceMotion ? "" : "animate-cop-blue"}`}
          />
        </div>
      </div>
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
        ref={nearestPanel}
        data-testid="nearest-opponent"
        className="absolute right-8 top-4 hidden w-60 text-right drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]"
      >
        <div className="flex items-center justify-end gap-2 text-sm uppercase tracking-widest text-sand/90">
          <span
            ref={nearestIsCop}
            data-testid="nearest-opponent-cop"
            className="hidden rounded-sm bg-[#2a5bd7] px-1.5 py-px leading-tight text-sand"
          >
            Cop
          </span>
          <span>Nearest</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <span ref={nearestClub} data-testid="nearest-opponent-club" role="img" aria-label="Holding a club" className="hidden">
            <ClubIcon className="h-7 w-7 text-sun" />
          </span>
          <div ref={nearestName} data-testid="nearest-opponent-name" className="truncate text-3xl italic leading-tight" />
        </div>
        <Bar fill={nearestStamina} label="Their stamina" />
      </div>
      <div className="absolute bottom-6 left-8 flex w-64 flex-col gap-2 drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]">
        <div ref={playerClub} data-testid="club" className="hidden">
          <div role="img" aria-label="Holding a club" className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-md border-2 border-sun/80 bg-night/70">
              <ClubIcon className="h-10 w-10 text-sun" />
            </div>
            <div className="leading-none">
              <div className="text-3xl uppercase italic text-sun">Club</div>
              <div className="mt-1 font-sans text-xs font-semibold uppercase tracking-widest text-sand/90">Punch to swing it</div>
            </div>
          </div>
        </div>
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

/** A meter from 0 to its full value (100, unless the frame loop says otherwise) whose fill the frame loop sizes and colours. */
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

/**
 * What to call out, if anything: a club changing hands with the player, a
 * cop fighting back against them, a cop going down, or someone busted
 * (the player's own bust ends their race, which the results screen says).
 */
function calloutFor(event: RaceEvent, { riders, cops }: RaceSnapshot): string | null {
  switch (event.type) {
    case "weapon-stolen": {
      const { from, by } = event;
      const name = (who: typeof from) => (who.kind === "rider" ? riders[who.id].name : cops[who.id].name);
      if (by.kind === "rider" && by.id === PLAYER) {
        return from.kind === "rider" ? `You took the club from ${name(from)}!` : `You took ${name(from)}'s club!`;
      }
      if (from.kind === "rider" && from.id === PLAYER) return `${name(by)} took your club!`;
      return null;
    }
    case "cop-retaliating":
      return event.target === PLAYER ? `${cops[event.cop].name} fights back!` : null;
    case "cop-knocked-off":
      return `${cops[event.cop].name} is down!`;
    case "busted":
      return event.rider === PLAYER ? null : `${riders[event.rider].name} got busted!`;
    default:
      return null;
  }
}

/**
 * What the player is doing, if they are off their bike: tumbling after a
 * crash, or after a car `knockedDown` them, then on foot, with a cop riding
 * to bust them if `copComing`.
 */
function statusOf(player: RiderSnapshot, knockedDown: boolean, copComing: boolean): string {
  if (player.status !== "racing") return "";
  if (player.crash === "tumbling") return knockedDown ? "Knocked down!" : "Crash!";
  if (player.crash === "on-foot") return copComing ? "Cop coming! Back to your bike!" : "Back to your bike!";
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

/** Fills a meter to `value` out of `full`, coloured by how full it is. */
function setBar(fill: HTMLDivElement | null, value: number, colour: (share: number) => string, full = FULL) {
  if (!fill) return;
  const share = Math.max(0, Math.min(1, value / full));
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
  if (meter && meter.getAttribute("aria-valuemax") !== String(full)) meter.setAttribute("aria-valuemax", String(full));
}

function setShown(element: HTMLElement | null, shown: boolean) {
  if (element && element.classList.contains("hidden") === shown) element.classList.toggle("hidden", !shown);
}

function setText(element: HTMLElement | null, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}
