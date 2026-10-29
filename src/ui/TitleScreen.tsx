import type { PersonalBest } from "@/save-data/save-data";
import { Button } from "./Button";
import { formatPosition, formatRaceTime } from "./format";

export function TitleScreen({
  personalBest,
  onStart,
  onSettings,
  onCredits,
}: {
  personalBest: PersonalBest;
  onStart: () => void;
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
        <Button onClick={onSettings}>Settings</Button>
        <Button onClick={onCredits}>Credits</Button>
      </div>
      <p className="text-sm text-sand/85 drop-shadow">W/A/S/D or the arrow keys to ride &middot; Esc or P to pause</p>
      {personalBest.time !== null && (
        <p className="text-sm text-sun drop-shadow">
          Personal best {formatRaceTime(personalBest.time)}
          {personalBest.position !== null && <> &middot; Best position {formatPosition(personalBest.position)}</>}
        </p>
      )}
    </div>
  );
}

export function GameTitle() {
  return (
    <h1 className="font-display text-7xl uppercase italic tracking-wide text-sun drop-shadow-[0_4px_0_rgba(27,16,38,0.9)] sm:text-8xl">
      Rev &amp; Wreck
    </h1>
  );
}
