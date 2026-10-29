import type { Settings } from "@/save-data/save-data";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
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
    <Dialog title="Settings" onBack={onBack} panelClassName="w-[min(32rem,90vw)] gap-6 px-10">
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
    </Dialog>
  );
}
