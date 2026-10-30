"use client";

import { advance } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startGameAudio, type GameAudio } from "@/audio/game-audio";
import { listenToPlayer, type PlayerControls } from "@/input/player-controls";
import { NO_INPUT } from "@/race";
import { Scene } from "@/renderer/Scene";
import { isMotionReduced, type SaveStorage } from "@/save-data/save-data";
import { ControlsScreen } from "@/ui/ControlsScreen";
import { CreditsScreen } from "@/ui/CreditsScreen";
import { Hud } from "@/ui/Hud";
import { PauseMenu } from "@/ui/PauseMenu";
import { ResultsScreen } from "@/ui/ResultsScreen";
import { SettingsScreen } from "@/ui/SettingsScreen";
import { TitleScreen } from "@/ui/TitleScreen";
import { GameSession } from "./session";

/** The whole game: the 3D scene with the screens and HUD over it. Runs in the browser only. */
export default function Game() {
  const controls = useRef<PlayerControls | null>(null);
  const audio = useRef<GameAudio | null>(null);
  const [session] = useState(
    () =>
      new GameSession({
        readInput: () => controls.current?.read() ?? NO_INPUT,
        storage: browserStorage(),
        newSeed: () => seedInAddress() ?? Math.floor(Math.random() * 2 ** 32),
      }),
  );
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const systemReducesMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    systemPrefersReducedMotion,
    () => false,
  );
  const reduceMotion = isMotionReduced(state.settings, systemReducesMotion);

  useEffect(() => {
    const listening = listenToPlayer(window, session.togglePause);
    controls.current = listening;
    return () => {
      listening.dispose();
      if (controls.current === listening) controls.current = null;
    };
  }, [session]);

  // The title screen is up: start the sound, which fetches the music now so it's ready for the race.
  useEffect(() => {
    const playing = startGameAudio(session);
    audio.current = playing;
    return () => {
      playing.dispose();
      if (audio.current === playing) audio.current = null;
    };
  }, [session]);

  // The clicks that start a race start the sound too: browsers only let sound start from a click or a key press.
  const startRace = () => {
    audio.current?.unlock();
    session.startRace();
  };
  const restart = () => {
    audio.current?.unlock();
    session.restart();
  };

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) session.pause();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [session]);

  // The game loop: read the gamepads, step the race, then render the scene, once per animation frame.
  useEffect(() => {
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now) {
      controls.current?.poll();
      session.advance(last === null ? 0 : (now - last) / 1000);
      // R3F derives useFrame's delta from this timestamp: pass seconds, as its clock expects.
      advance(now / 1000);
      last = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [session]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Scene session={session} reduceMotion={reduceMotion} />
      {state.screen === "title" && (
        <TitleScreen
          personalBest={state.personalBest}
          onStart={startRace}
          onControls={session.openControls}
          onSettings={session.openSettings}
          onCredits={session.openCredits}
        />
      )}
      {state.screen === "settings" && (
        <SettingsScreen
          settings={state.settings}
          reduceMotion={reduceMotion}
          onChange={session.changeSettings}
          onBack={session.closeSettings}
        />
      )}
      {state.screen === "controls" && <ControlsScreen onBack={session.closeControls} />}
      {state.screen === "credits" && <CreditsScreen onBack={session.closeCredits} />}
      {(state.screen === "racing" || state.screen === "paused") && <Hud session={session} />}
      {state.screen === "paused" && (
        <PauseMenu onResume={session.resume} onRestart={restart} onQuit={session.quitToTitle} />
      )}
      {state.screen === "results" && state.results && (
        <ResultsScreen
          results={state.results}
          personalBest={state.personalBest}
          newBestTime={state.newBestTime}
          newBestPosition={state.newBestPosition}
          onRestart={restart}
          onTitle={session.quitToTitle}
        />
      )}
    </div>
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the operating system asks for reduced motion. */
function systemPrefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * The seed the page's address asks every race to use, as in `?seed=1234`, so
 * that a race from a bug report can be played again; null when it asks for
 * none, or for something that isn't a seed (a whole number below 2^32).
 */
function seedInAddress(): number | null {
  const asked = new URLSearchParams(window.location.search).get("seed");
  if (asked === null || !/^\d{1,10}$/.test(asked)) return null;
  const seed = Number(asked);
  return seed < 2 ** 32 ? seed : null;
}

/** localStorage, or undefined where the browser refuses it (private modes, blocked storage). */
function browserStorage(): SaveStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
