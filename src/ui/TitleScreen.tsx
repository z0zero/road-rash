import { KEYS, RIDING_KEYS, type Key } from "@/input/bindings";
import type { Difficulty } from "@/race";
import type { PersonalBest } from "@/save-data/save-data";
import { Button } from "./Button";
import { DifficultyPicker } from "./DifficultyPicker";
import { difficultyName, formatPosition, formatRaceTime } from "./format";
import { nameOn, useKeyboardLabels } from "./key-names";

/**
 * A line of text straight over the scene, such as the start gantry's beam or a
 * passing car: on a band of shade of its own, so that it reads over anything.
 */
const OVER_THE_SCENE = "rounded-full bg-night/55 px-4 py-1 drop-shadow";

export function TitleScreen({
  difficulty,
  personalBest,
  onChooseDifficulty,
  onStart,
  onControls,
  onSettings,
  onCredits,
}: {
  /** The difficulty the next race is run at. */
  difficulty: Difficulty;
  /** The personal best on that difficulty. */
  personalBest: PersonalBest;
  onChooseDifficulty: (difficulty: Difficulty) => void;
  onStart: () => void;
  onControls: () => void;
  onSettings: () => void;
  onCredits: () => void;
}) {
  const labels = useKeyboardLabels();
  /** The keys, by their names on the player's keyboard, as a sentence says them: "J or Z". */
  const namesOf = (keys: readonly Key[]) => keys.map((key) => nameOn(labels, key)).join(" or ");
  // The keys to ride with, "W/A/S/D or the arrow keys": each set by what it is called, or else by its keys.
  const ridingKeys = RIDING_KEYS.map((keys) => {
    const each = [keys.throttle, keys.steerLeft, keys.brake, keys.steerRight];
    return keys.together ?? each.map((key) => nameOn(labels, key)).join("/");
  }).join(" or ");
  return (
    // Centred by its margins, which give way where the window is too short even for the tighter spacing of a short
    // one: then it starts at the top and scrolls, rather than overflowing both ways out of reach.
    <div className="absolute inset-0 flex flex-col overflow-y-auto bg-gradient-to-b from-night/75 via-dusk/35 to-transparent px-6 py-4">
      <div className="my-auto flex flex-col items-center gap-6 text-center short:gap-4">
        <GameTitle />
        <p className={`text-lg text-sand ${OVER_THE_SCENE}`}>Race the coastal cliff road at sunset. Don&apos;t wreck it.</p>
        <div className="flex flex-col gap-3 short:gap-2">
          <Button autoFocus onClick={onStart}>
            Start Race
          </Button>
          <DifficultyPicker difficulty={difficulty} onChoose={onChooseDifficulty} onStart={onStart} />
          <Button onClick={onControls}>Controls</Button>
          <Button onClick={onSettings}>Settings</Button>
          <Button onClick={onCredits}>Credits</Button>
        </div>
        <p className={`text-sm text-sand/90 ${OVER_THE_SCENE}`}>
          {ridingKeys} to ride &middot; {namesOf(KEYS.punch)} to punch, or swing a club &middot;{" "}
          {namesOf(KEYS.kick)} to kick &middot; {namesOf(KEYS.pause)} to pause
        </p>
        {personalBest.time !== null && (
          <p data-testid="title-personal-best" className="text-sm text-sun drop-shadow">
            Personal best on {difficultyName(difficulty)} {formatRaceTime(personalBest.time)}
            {personalBest.position !== null && <> &middot; Best position {formatPosition(personalBest.position)}</>}
          </p>
        )}
      </div>
    </div>
  );
}

export function GameTitle() {
  return (
    <h1 className="font-display text-6xl uppercase italic tracking-wide text-sun drop-shadow-[0_4px_0_rgba(27,16,38,0.9)] sm:text-8xl sm:short:text-7xl">
      Rev &amp; Wreck
    </h1>
  );
}
