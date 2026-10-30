/**
 * A small, quiet note over the race that the browser is keeping the sound
 * locked, as Safari, and Firefox before 155, do after a race started with a
 * gamepad, and that a key press or click turns it on. It sits under the cop
 * alert's place, above the countdown.
 */
export function SoundLockedNotice() {
  return (
    <div
      data-testid="sound-locked"
      role="status"
      className="pointer-events-none absolute inset-x-0 top-[8rem] flex justify-center px-4"
    >
      <p className="flex items-center gap-2 rounded-full bg-night/70 px-4 py-1.5 text-sm text-sand/90 shadow">
        <SoundOff />
        Press a key or click to turn the sound on
      </p>
    </div>
  );
}

/** A loudspeaker, crossed out. */
function SoundOff() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" strokeLinejoin="round" />
      <path d="m16 9 6 6m0-6-6 6" strokeLinecap="round" />
    </svg>
  );
}
