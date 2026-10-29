import type { Settings } from "@/save-data/save-data";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { VolumeSlider } from "./VolumeSlider";

/** The player's settings, reached from the title screen. Esc goes back. */
export function SettingsScreen({
  settings,
  reduceMotion,
  onChange,
  onBack,
}: {
  /** The settings as saved. */
  settings: Settings;
  /** Whether Reduce motion is on now, whether the player chose it or the operating system prefers it. */
  reduceMotion: boolean;
  onChange: (change: Partial<Settings>) => void;
  onBack: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-night/60 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onBack();
      }}
    >
      <div className="flex w-[min(32rem,90vw)] flex-col items-center gap-6 rounded-xl border border-sun/40 bg-night/85 px-10 py-8 shadow-2xl">
        <h2 id="settings-title" className="font-display text-5xl uppercase italic tracking-wide text-sun">
          Settings
        </h2>
        <VolumeSlider
          label="Master volume"
          volume={settings.masterVolume}
          onChange={(volume) => onChange({ masterVolume: volume })}
        />
        <VolumeSlider
          label="Music volume"
          volume={settings.musicVolume}
          onChange={(volume) => onChange({ musicVolume: volume })}
        />
        <VolumeSlider
          label="Effects volume"
          volume={settings.effectsVolume}
          onChange={(volume) => onChange({ effectsVolume: volume })}
        />
        <Switch
          label="Reduce motion"
          description="No camera shake, motion blur or speed lines."
          checked={reduceMotion}
          onChange={(on) => onChange({ reduceMotion: on })}
        />
        <Button autoFocus onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
