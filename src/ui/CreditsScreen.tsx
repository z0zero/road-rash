import type { ReactNode } from "react";
import { MUSIC } from "@/audio/music";
import { Button } from "./Button";

/** Who made what, and the game's independence from Road Rash, reached from the title screen. Esc goes back. */
export function CreditsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-title"
      className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-night/60 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onBack();
      }}
    >
      <div className="flex w-[min(36rem,92vw)] flex-col items-center gap-6 rounded-xl border border-sun/40 bg-night/85 px-10 py-8 text-center shadow-2xl">
        <h2 id="credits-title" className="font-display text-5xl uppercase italic tracking-wide text-sun">
          Credits
        </h2>
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="font-display text-xl uppercase tracking-wider text-sunset">Music</dt>
            <dd className="text-sand">
              &ldquo;<ExternalLink href={MUSIC.page}>{MUSIC.title}</ExternalLink>&rdquo; by{" "}
              <ExternalLink href={MUSIC.authorPage}>{MUSIC.author}</ExternalLink>, from OpenGameArt.org,
              <br />
              licensed <ExternalLink href={MUSIC.licencePage}>{MUSIC.licence}</ExternalLink> (public domain)
            </dd>
          </div>
          <div>
            <dt className="font-display text-xl uppercase tracking-wider text-sunset">Sound effects</dt>
            <dd className="text-sand">Synthesized in your browser as you play</dd>
          </div>
          <div>
            <dt className="font-display text-xl uppercase tracking-wider text-sunset">Bikes, riders and the coast</dt>
            <dd className="text-sand">Built in code, without models or textures</dd>
          </div>
        </dl>
        <p className="text-sm text-sand/80">
          Rev &amp; Wreck is inspired by Road Rash, but is not affiliated with Road Rash or Electronic Arts. Road
          Rash is a trademark of Electronic Arts.
        </p>
        <Button autoFocus onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sun underline decoration-sun/50 underline-offset-2 hover:text-sunset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun"
    >
      {children}
    </a>
  );
}
