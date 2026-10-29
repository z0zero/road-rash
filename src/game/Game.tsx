"use client";

import { advance } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listenToKeyboard, type Keyboard } from "@/input/keyboard";
import { NO_INPUT } from "@/race";
import { Scene } from "@/renderer/Scene";
import type { SaveStorage } from "@/save-data/save-data";
import { Hud } from "@/ui/Hud";
import { PauseMenu } from "@/ui/PauseMenu";
import { ResultsScreen } from "@/ui/ResultsScreen";
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

  useEffect(() => {
    const listening = listenToKeyboard(window, session.togglePause);
    keyboard.current = listening;
    return () => {
      listening.dispose();
      if (keyboard.current === listening) keyboard.current = null;
    };
  }, [session]);

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
      <Scene session={session} />
      {state.screen === "title" && <TitleScreen personalBest={state.personalBest} onStart={session.startRace} />}
      {(state.screen === "racing" || state.screen === "paused") && <Hud session={session} />}
      {state.screen === "paused" && (
        <PauseMenu onResume={session.resume} onRestart={session.restart} onQuit={session.quitToTitle} />
      )}
      {state.screen === "results" && state.results && (
        <ResultsScreen
          results={state.results}
          personalBest={state.personalBest}
          newBestTime={state.newBestTime}
          onRestart={session.restart}
          onTitle={session.quitToTitle}
        />
      )}
    </div>
  );
}

/** localStorage, or undefined where the browser refuses it (private modes, blocked storage). */
function browserStorage(): SaveStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
