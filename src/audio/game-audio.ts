import { fetchMusic } from "./music";

/** The game's sound. */
export interface GameAudio {
  /** Stops everything and lets go of the browser's audio. */
  dispose(): void;
}

/**
 * Starts the game's sound. Call it once the title screen is up: it fetches the
 * music straight away, so the music is ready when the race starts.
 */
export function startGameAudio(): GameAudio {
  const loading = new AbortController();
  void fetchMusic(loading.signal);
  return {
    dispose() {
      loading.abort();
    },
  };
}
