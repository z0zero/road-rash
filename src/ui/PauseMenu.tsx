import type { Press } from "@/input/menus";
import type { RaceOptions } from "@/race";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { RaceReplay } from "./RaceReplay";

/** The pause menu: resume, restart or quit to the title, with the race's difficulty and seed for a bug report. */
export function PauseMenu({
  raceOptions,
  onResume,
  onRestart,
  onQuit,
}: {
  /** The race's seed and difficulty. */
  raceOptions: Required<RaceOptions>;
  onResume: () => void;
  onRestart: (press: Press) => void;
  onQuit: () => void;
}) {
  return (
    <Dialog title="Paused" escGoesBack={false} panelClassName="gap-4 px-10 [&>h2]:mb-2">
      <Button data-back autoFocus onClick={onResume}>
        Resume
      </Button>
      <Button onClick={onRestart}>Restart</Button>
      <Button onClick={onQuit}>Quit to title</Button>
      <RaceReplay raceOptions={raceOptions} />
    </Dialog>
  );
}
