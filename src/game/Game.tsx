"use client";

import { advance } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startGameAudio, type GameAudio } from "@/audio/game-audio";
import type { Press } from "@/input/menus";
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
import { askedInAddress } from "./race-address";
import { GameSession } from "./session";

/** The whole game: the 3D scene with the screens and HUD over it. Runs in the browser only. */
export default function Game() {
  const controls = useRef<PlayerControls | null>(null);
  const audio = useRef<GameAudio | null>(null);
  const [session] = useState(() => {
    const asked = askedInAddress(window.location.search);
    return new GameSession({
      readInput: () => controls.current?.read() ?? NO_INPUT,
      storage: browserStorage(),
      newSeed: () => asked.seed ?? Math.floor(Math.random() * 2 ** 32),
      askedDifficulty: asked.difficulty,
      now: () => performance.now(),
    });
  });
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const systemReducesMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    systemPrefersReducedMotion,
    () => false,
  );
  const reduceMotion = isMotionReduced(state.settings, systemReducesMotion);
  /** Whether the browser is keeping the sound locked although a race has asked for it. */
  const [soundLocked, setSoundLocked] = useState(false);

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
    const playing = startGameAudio(session, setSoundLocked);
    audio.current = playing;
    return () => {
      playing.dispose();
      if (audio.current === playing) audio.current = null;
    };
  }, [session]);

  // The presses that start a race start the sound too: browsers only let sound start from a key press or click.
  const startRace = (press: Press) => {
    audio.current?.unlock(press.isTrusted);
    session.startRace();
  };
  const restart = (press: Press) => {
    audio.current?.unlock(press.isTrusted);
    session.restart();
  };
  // The same function every render, so that the HUD subscribes to the race's events once.
  const inputDevice = useCallback(() => controls.current?.lastUsed() ?? "keyboard", []);

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
      const racingBeforePoll = session.getState().screen === "racing";
      controls.current?.poll();
      const racingAfterPoll = session.getState().screen === "racing";
      // A punch or kick pressed while no race is ridden, on the pause menu say, goes nowhere: it is read and
      // dropped here, so it isn't thrown the moment the race resumes. Nor is the kick of a gamepad's B that
      // goes back to the race from the pause menu, in the poll between the two.
      if (!racingBeforePoll || !racingAfterPoll) controls.current?.read();
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
          difficulty={state.raceOptions.difficulty}
          personalBest={state.personalBest}
          onChooseDifficulty={session.chooseDifficulty}
          onStart={startRace}
          onControls={() => session.openFromTitle("controls")}
          onSettings={() => session.openFromTitle("settings")}
          onCredits={() => session.openFromTitle("credits")}
        />
      )}
      {state.screen === "settings" && (
        <SettingsScreen
          settings={state.settings}
          reduceMotion={reduceMotion}
          onChange={session.changeSettings}
          onBack={session.backToTitle}
        />
      )}
      {state.screen === "controls" && <ControlsScreen onBack={session.backToTitle} />}
      {state.screen === "credits" && <CreditsScreen onBack={session.backToTitle} />}
      {(state.screen === "racing" || state.screen === "paused") && (
        <Hud session={session} reduceMotion={reduceMotion} inputDevice={inputDevice} soundLocked={soundLocked} />
      )}
      {state.screen === "paused" && (
        <PauseMenu
          raceOptions={state.raceOptions}
          onResume={session.resume}
          onRestart={restart}
          onQuit={session.quitToTitle}
        />
      )}
      {state.screen === "results" && state.results && (
        <ResultsScreen
          results={state.results}
          personalBest={state.personalBest}
          newBestTime={state.newBestTime}
          newBestPosition={state.newBestPosition}
          raceOptions={state.raceOptions}
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

/** localStorage, or undefined where the browser refuses it (private modes, blocked storage). */
function browserStorage(): SaveStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
