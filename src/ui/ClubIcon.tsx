/** A club, head up and to the right, drawn in the current text colour. */
export function ClubIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <g transform="rotate(40 12 12)">
        {/* The head, widening from the shaft to a rounded end. */}
        <path d="M10.3 14.4 L8.5 4.2 Q12 0.4 15.5 4.2 L13.7 14.4 Z" />
        {/* The taped grip and its knob. */}
        <rect x="10.55" y="14.9" width="2.9" height="5.6" rx="1" opacity="0.75" />
        <rect x="9.7" y="20.3" width="4.6" height="2.3" rx="1.15" />
      </g>
    </svg>
  );
}
