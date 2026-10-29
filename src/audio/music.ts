/**
 * The race's music: "Funked Up" by Joth, a looping funk-rock track (guitar,
 * bass, drums and Rhodes) from OpenGameArt.org. It was downloaded from
 * https://opengameart.org/content/funked-up on 2026-10-29, when that page gave
 * its licence as CC0 (https://creativecommons.org/publicdomain/zero/1.0/). The
 * author appreciates credit but doesn't require it; the Credits screen gives it.
 * The file in public/audio is the download unchanged (1,329,549 bytes, SHA-256
 * 57cd81254a0f4e068535c5421f93b586514332ad2377f81aea190dd91659fff3).
 */
export const MUSIC = {
  title: "Funked Up",
  author: "Joth",
  authorPage: "https://opengameart.org/users/joth",
  page: "https://opengameart.org/content/funked-up",
  licence: "CC0",
  licencePage: "https://creativecommons.org/publicdomain/zero/1.0/",
  url: "/audio/funked-up.mp3",
} as const;

/** The music file's bytes, or null when they can't be had (offline, aborted). Never rejects. */
export async function fetchMusic(signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(MUSIC.url, { signal });
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}
