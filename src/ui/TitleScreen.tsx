import { KEYS, namesOf } from "@/input/bindings";
import type { PersonalBest } from "@/save-data/save-data";
import { Button } from "./Button";
import { formatPosition, formatRaceTime } from "./format";

export function TitleScreen({
  personalBest,
  onStart,
  onControls,
  onSettings,
  onCredits,
}: {
  personalBest: PersonalBest;
  onStart: () => void;
  onControls: () => void;
  onSettings: () => void;
  onCredits: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-night/75 via-dusk/35 to-transparent px-6 text-center">
      <GameTitle />
      <p className="text-lg text-sand/90 drop-shadow">Race the coastal cliff road at sunset. Don&apos;t wreck it.</p>
      <div className="flex flex-col gap-3">
        <Button autoFocus onClick={onStart}>
          Start Race
        </Button>
        <Button onClick={onControls}>Controls</Button>
        <Button onClick={onSettings}>Settings</Button>
        <Button onClick={onCredits}>Credits</Button>
      </div>
      <p className="text-sm text-sand/85 drop-shadow">
        {RIDING_LETTERS} or the arrow keys to ride &middot; {namesOf(KEYS.punch)} to punch, or swing a club &middot;{" "}
        {namesOf(KEYS.kick)} to kick &middot; {namesOf(KEYS.pause)} to pause
      </p>
      {personalBest.time !== null && (
        <p className="text-sm text-sun drop-shadow">
          Personal best {formatRaceTime(personalBest.time)}
          {personalBest.position !== null && <> &middot; Best position {formatPosition(personalBest.position)}</>}
        </p>
      )}
    </div>
  );
}

/** The letter keys to ride with, "W/A/S/D": the first key for each way, the arrow keys being the others. */
const RIDING_LETTERS = [KEYS.throttle, KEYS.steerLeft, KEYS.brake, KEYS.steerRight].map((keys) => keys[0].name).join("/");

export function GameTitle() {
  return (
    <h1 className="font-display text-6xl uppercase italic tracking-wide text-sun drop-shadow-[0_4px_0_rgba(27,16,38,0.9)] sm:text-8xl">
      Rev &amp; Wreck
    </h1>
  );
}
