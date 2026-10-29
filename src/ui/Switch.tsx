import { useId } from "react";

/** An on/off setting: its name and what it does on the left, the switch on the right. */
export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex w-full items-center justify-between gap-6">
      <div>
        <div id={`${id}-label`} className="text-xl font-semibold text-sand">
          {label}
        </div>
        <p id={`${id}-description`} className="text-sm text-sand/75">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full border-2 transition motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun ${
          checked ? "border-sun bg-sunset" : "border-sand/50 bg-night/60"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-sand shadow transition-transform motion-reduce:transition-none ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
