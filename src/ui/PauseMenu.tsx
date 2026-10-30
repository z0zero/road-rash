import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { RaceSeed } from "./RaceSeed";

/** The pause menu: resume, restart or quit to the title, with the race's seed for a bug report. */
export function PauseMenu({
  seed,
  onResume,
  onRestart,
  onQuit,
}: {
  seed: number;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  return (
    <Dialog title="Paused" panelClassName="gap-4 px-10 [&>h2]:mb-2">
      <Button autoFocus onClick={onResume}>
        Resume
      </Button>
      <Button onClick={onRestart}>Restart</Button>
      <Button onClick={onQuit}>Quit to title</Button>
      <RaceSeed seed={seed} />
    </Dialog>
  );
}
