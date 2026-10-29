import { Button } from "./Button";

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="absolute inset-0 flex items-center justify-center bg-night/60 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 rounded-xl border border-sun/40 bg-night/85 px-10 py-8 shadow-2xl">
        <h2 id="pause-title" className="mb-2 font-display text-5xl uppercase italic tracking-wide text-sun">
          Paused
        </h2>
        <Button autoFocus onClick={onResume}>
          Resume
        </Button>
        <Button onClick={onRestart}>Restart</Button>
        <Button onClick={onQuit}>Quit to title</Button>
      </div>
    </div>
  );
}
