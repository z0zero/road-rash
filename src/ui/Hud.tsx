import { type ReactNode, useEffect, useRef, type RefObject } from "react";
import type { GameSession } from "@/game/session";
import { KEYS } from "@/input/bindings";
import { GAMEPAD } from "@/input/gamepad";
import type { InputDevice } from "@/input/player-controls";
import { clamp } from "@/math";
import {
  COP_FULL_STAMINA,
  FULL_CONDITION,
  FULL_STAMINA,
  isPlayer,
  PLAYER,
  type RaceEvent,
  type RaceSnapshot,
  type RiderSnapshot,
} from "@/race";
import { liveryOf } from "@/renderer/liveries";
import { ClubIcon } from "./ClubIcon";
import { formatRaceTime, toKmh } from "./format";
import { useKeyboardLabels } from "./key-names";
import { Alternatives, keyCombos, padCombos } from "./KeyCaps";

/** How long "GO!" stays up after the countdown, in seconds of race time. */
const GO_SECONDS = 0.8;

/** How long a callout, such as a club changing hands, stays up, in seconds of race time. */
const CALLOUT_SECONDS = 1.8;

/** How long the hit-back prompt stays up after a hit, unless the player attacks first, in seconds of race time. */
const HIT_BACK_PROMPT_SECONDS = 4;

/**
 * Position, speed, race time, progress along the track with a marker for
 * every rider, the 3-2-1 countdown, the player's stamina and bike condition,
 * a club icon while the player holds one, the nearest opponent's (or
 * cop's) name, stamina and club, warning arrows for riders alongside or
 * coming up from behind, the cop alert while a cop is near (its lights
 * flashing unless motion is reduced), callouts when a club changes hands
 * with the player or a cop fights back, goes down or busts someone, and the
 * hit-back prompt, naming the controls of `inputDevice`, the one the player is
 * using. It is updated straight from the frame loop through refs, never
 * through React state.
 */
export function Hud({
  session,
  reduceMotion,
  inputDevice,
}: {
  session: GameSession;
  reduceMotion: boolean;
  inputDevice: () => InputDevice;
}) {
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
  const hitBackPrompt = useRef<HTMLDivElement>(null);
  const hitBackKeys = useRef<HTMLDivElement>(null);
  const hitBackButtons = useRef<HTMLDivElement>(null);
  /** The stretch of race time the hit-back prompt shows for, unless the player attacks first. */
  const hitBackShown = useRef({ from: 0, until: 0 });
  const riders = session.view.current.riders;
  const labels = useKeyboardLabels();

  useEffect(
    () =>
      session.onRaceEvent((event) => {
        const { clock } = session.view.current;
        const text = calloutFor(event, session.view.current);
        if (text) {
          setText(callout.current, text);
          calloutShown.current = { from: clock, until: clock + CALLOUT_SECONDS };
        }
        // An opponent's hit on a player who has never attacked shows them how, on what they are riding with...
        if (isAnOpponentsHitOnThePlayer(event) && !session.getState().settings.hasAttacked) {
          const gamepad = inputDevice() === "gamepad";
          setShown(hitBackKeys.current, !gamepad);
          setShown(hitBackButtons.current, gamepad);
          setShown(hitBackPrompt.current, true);
          hitBackShown.current = { from: clock, until: clock + HIT_BACK_PROMPT_SECONDS };
        }
        // ...until they attack.
        if (event.type === "attack-thrown" && isPlayer(event.attacker)) setShown(hitBackPrompt.current, false);
      }),
    [session, inputDevice],
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
        setBar(stamina.current, player.stamina, FULL_STAMINA, staminaColour);
        setBar(condition.current, player.condition, FULL_CONDITION, conditionColour);
        const nearest = current.nearestOpponentOrCop;
        setShown(nearestPanel.current, nearest !== null);
        if (nearest) {
          const isCop = nearest.kind === "cop";
          const them = isCop ? current.cops[nearest.id] : current.riders[nearest.id];
          setText(nearestName.current, them.name);
          setBar(nearestStamina.current, them.stamina, isCop ? COP_FULL_STAMINA : FULL_STAMINA, staminaColour);
          setShown(nearestClub.current, them.weapon === "club");
          setShown(nearestIsCop.current, isCop);
        }
        setShown(warnLeft.current, current.warnings.left);
        setShown(warnRight.current, current.warnings.right);
        setShown(copAlert.current, current.cops.some((cop) => cop.near));
        const copComing = current.cops.some((cop) => cop.busting === PLAYER);
        setText(status.current, statusOf(player, copComing));
        setShown(playerClub.current, player.weapon === "club");
        // A callout or the hit-back prompt goes once its time is up, or straight away in a race that has started over.
        const { from, until } = calloutShown.current;
        if (current.clock >= until || current.clock < from) setText(callout.current, "");
        const prompt = hitBackShown.current;
        if (current.clock >= prompt.until || current.clock < prompt.from) setShown(hitBackPrompt.current, false);
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
            className={`h-4 w-4 rounded-full bg-cop-red shadow-[0_0_14px_4px_var(--color-cop-red)] ${reduceMotion ? "" : "animate-cop-red"}`}
          />
          <span className="text-3xl uppercase italic leading-none tracking-wide text-sand">Cop</span>
          <span
            className={`h-4 w-4 rounded-full bg-cop-blue shadow-[0_0_14px_4px_var(--color-cop-blue)] ${reduceMotion ? "" : "animate-cop-blue"}`}
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
        <Bar fill={nearestStamina} label="Their stamina" full={FULL_STAMINA} />
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
          <Bar fill={stamina} label="Stamina" full={FULL_STAMINA} testId="stamina" />
        </div>
        <div>
          <div className="text-sm uppercase tracking-widest text-sand/90">Bike</div>
          <Bar fill={condition} label="Bike condition" full={FULL_CONDITION} testId="condition" />
        </div>
      </div>
      {/* Between the stamina and bike bars and the speed, wrapping onto two lines where it would reach them. */}
      <div ref={hitBackPrompt} data-testid="hit-back-prompt" role="status" className="absolute inset-x-0 bottom-6 hidden">
        <div
          className={`mx-auto flex w-fit max-w-[max(20rem,calc(100vw-37rem))] flex-col items-center gap-2 rounded-xl border-2 border-sun/70 bg-night/85 px-6 pb-3 pt-2 shadow-lg ${reduceMotion ? "" : "animate-prompt-in"}`}
        >
          <div className="text-4xl uppercase italic leading-none tracking-wide text-sun drop-shadow-[0_3px_0_rgba(27,16,38,0.85)]">
            Hit back!
          </div>
          <div ref={hitBackKeys} data-testid="hit-back-keys">
            <PunchAndKick
              punch={<Alternatives combos={keyCombos(KEYS.punch, labels)} large />}
              kick={<Alternatives combos={keyCombos(KEYS.kick, labels)} large />}
            />
          </div>
          <div ref={hitBackButtons} data-testid="hit-back-buttons" className="hidden">
            <PunchAndKick
              punch={<Alternatives combos={padCombos(GAMEPAD.punch)} large />}
              kick={<Alternatives combos={padCombos(GAMEPAD.kick)} large />}
            />
          </div>
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

/** The hit-back prompt's line: the keys or buttons to punch with, then those to kick with. */
function PunchAndKick({ punch, kick }: { punch: ReactNode; kick: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
      <span className="whitespace-nowrap">
        {punch}
        <span className="ml-2 text-2xl uppercase italic tracking-wide">to punch</span>
      </span>
      <span className="whitespace-nowrap">
        {kick}
        <span className="ml-2 text-2xl uppercase italic tracking-wide">to kick</span>
      </span>
    </div>
  );
}

/** Whether an event is an opponent's hit landing on the player. */
function isAnOpponentsHitOnThePlayer(event: RaceEvent): boolean {
  return event.type === "attack-landed" && isPlayer(event.target) && event.attacker.kind === "rider";
}

/** A meter from 0 to `full`, at first full, whose fill the frame loop sizes and colours (and refills to its own full value). */
function Bar({
  fill,
  label,
  full,
  testId,
}: {
  fill: RefObject<HTMLDivElement | null>;
  label: string;
  full: number;
  testId?: string;
}) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={full}
      aria-valuenow={full}
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
 * crash, or after a car knocked them down, then on foot, with a cop riding
 * to bust them from the moment it sets off if `copComing`.
 */
function statusOf(player: RiderSnapshot, copComing: boolean): string {
  if (player.status !== "racing" || player.crash === null) return "";
  if (player.crash === "on-foot") return copComing ? "Cop coming! Back to your bike!" : "Back to your bike!";
  return `${player.crash === "knocked-down" ? "Knocked down!" : "Crash!"}${copComing ? " Cop coming!" : ""}`;
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
function setBar(fill: HTMLDivElement | null, value: number, full: number, colour: (share: number) => string) {
  if (!fill) return;
  const share = clamp(value / full, 0, 1);
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
