"use client";

import { advance } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startGameAudio } from "@/audio/game-audio";
import { listenToKeyboard, type Keyboard } from "@/input/keyboard";
import { NO_INPUT } from "@/race";
import { Scene } from "@/renderer/Scene";
import { isMotionReduced, type SaveStorage } from "@/save-data/save-data";
import { CreditsScreen } from "@/ui/CreditsScreen";
import { Hud } from "@/ui/Hud";
import { PauseMenu } from "@/ui/PauseMenu";
import { ResultsScreen } from "@/ui/ResultsScreen";
import { SettingsScreen } from "@/ui/SettingsScreen";
import { TitleScreen } from "@/ui/TitleScreen";
import { GameSession } from "./session";

/** The whole game: the 3D scene with the screens and HUD over it. Runs in the browser only. */
export default function Game() {
  const keyboard = useRef<Keyboard | null>(null);
  const [session] = useState(
    () =>
      new GameSession({
        readInput: () => keyboard.current?.read() ?? NO_INPUT,
        storage: browserStorage(),
        newSeed: () => Math.floor(Math.random() * 2 ** 32),
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
    const listening = listenToKeyboard(window, session.togglePause);
    keyboard.current = listening;
    return () => {
      listening.dispose();
      if (keyboard.current === listening) keyboard.current = null;
    };
  }, [session]);

  // The title screen is up: start the sound, which fetches the music now so it's ready for the race.
  useEffect(() => {
    const audio = startGameAudio();
    return () => audio.dispose();
  }, []);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) session.pause();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [session]);

  // The game loop: step the race, then render the scene, once per animation frame.
  useEffect(() => {
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now) {
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
          onStart={session.startRace}
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
      {state.screen === "credits" && <CreditsScreen onBack={session.closeCredits} />}
      {(state.screen === "racing" || state.screen === "paused") && <Hud session={session} />}
      {state.screen === "paused" && (
        <PauseMenu onResume={session.resume} onRestart={session.restart} onQuit={session.quitToTitle} />
      )}
      {state.screen === "results" && state.results && (
        <ResultsScreen
          results={state.results}
          personalBest={state.personalBest}
          newBestTime={state.newBestTime}
          newBestPosition={state.newBestPosition}
          onRestart={session.restart}
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

/** localStorage, or undefined where the browser refuses it (private modes, blocked storage). */
function browserStorage(): SaveStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
