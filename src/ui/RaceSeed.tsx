/**
 * The race's seed, small, for a bug report: with `?seed=` and the seed in the
 * page's address, the game races that same race again.
 */
export function RaceSeed({ seed }: { seed: number }) {
  return (
    <p
      data-testid="race-seed"
      title={`Add ?seed=${seed} to the page's address to race this race again`}
      className="text-xs uppercase tracking-widest text-sand/60"
    >
      Race seed <span className="select-all font-sans font-semibold normal-case tabular-nums">{seed}</span>
    </p>
  );
}
