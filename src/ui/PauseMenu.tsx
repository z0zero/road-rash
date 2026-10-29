import { Button } from "./Button";
import { Dialog } from "./Dialog";

export function PauseMenu({
  onResume,
  onRestart,
  onQuit,
}: {
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
    </Dialog>
  );
}
