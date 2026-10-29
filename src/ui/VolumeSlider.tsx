import { useId } from "react";

/** A volume from 0 (silent) to 1 (full), set in steps of 5%: its name and percentage above, the slider below. */
export function VolumeSlider({
  label,
  volume,
  onChange,
}: {
  label: string;
  volume: number;
  onChange: (volume: number) => void;
}) {
  const id = useId();
  const percent = Math.round(volume * 100);
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-baseline justify-between gap-6">
        <label htmlFor={id} className="text-xl font-semibold text-sand">
          {label}
        </label>
        <span aria-hidden="true" className="tabular-nums text-sand/75">
          {percent}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-2 w-full cursor-pointer accent-sunset focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun"
      />
    </div>
  );
}
