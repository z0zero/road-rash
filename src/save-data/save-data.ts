import type { RaceResults } from "@/race";

/**
 * Save data: the player's settings and personal best, kept in the browser's
 * localStorage under one versioned key. Missing or corrupt data and storage
 * that throws fall back to the defaults and never break the game.
 */

export interface Settings {
  /** 0 (silent) to 1 (full). */
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly effectsVolume: number;
  /** null until the player chooses; until then the game follows the operating system's reduced-motion preference. */
  readonly reduceMotion: boolean | null;
  /** Whether the player has ever attacked in a race: until they have, the HUD shows them the hit-back prompt. */
  readonly hasAttacked: boolean;
}

export interface PersonalBest {
  /** The fastest finishing time in seconds, or null before the first finish. */
  readonly time: number | null;
  /** The best finishing position, or null before the first finish. */
  readonly position: number | null;
}

export interface SaveData {
  readonly settings: Settings;
  readonly personalBest: PersonalBest;
}

export const DEFAULT_SAVE_DATA: SaveData = {
  settings: { masterVolume: 1, musicVolume: 0.7, effectsVolume: 1, reduceMotion: null, hasAttacked: false },
  personalBest: { time: null, position: null },
};

/** The part of the browser's Storage that save data uses. */
export type SaveStorage = Pick<Storage, "getItem" | "setItem">;

/** Everything is saved under this one key; a new version gets a new key. */
const KEY = "rev-and-wreck:v1";

/**
 * Reads the save data. Anything missing or invalid falls back to its default,
 * field by field, so one bad value never loses the rest. Never throws.
 */
export function loadSaveData(storage: SaveStorage | undefined): SaveData {
  let parsed: unknown;
  try {
    const saved = storage?.getItem(KEY);
    if (!saved) return DEFAULT_SAVE_DATA;
    parsed = JSON.parse(saved);
  } catch {
    return DEFAULT_SAVE_DATA;
  }
  const settings = fields(fields(parsed).settings);
  const personalBest = fields(fields(parsed).personalBest);
  const defaults = DEFAULT_SAVE_DATA.settings;
  return {
    settings: {
      masterVolume: isVolume(settings.masterVolume) ? settings.masterVolume : defaults.masterVolume,
      musicVolume: isVolume(settings.musicVolume) ? settings.musicVolume : defaults.musicVolume,
      effectsVolume: isVolume(settings.effectsVolume) ? settings.effectsVolume : defaults.effectsVolume,
      reduceMotion: typeof settings.reduceMotion === "boolean" ? settings.reduceMotion : defaults.reduceMotion,
      hasAttacked: typeof settings.hasAttacked === "boolean" ? settings.hasAttacked : defaults.hasAttacked,
    },
    personalBest: {
      time: isTime(personalBest.time) ? personalBest.time : null,
      position: isPosition(personalBest.position) ? personalBest.position : null,
    },
  };
}

/**
 * The save data with a race's result counted towards the personal best: only
 * finishes count, and the fastest time and best position are kept separately.
 */
export function recordRaceResult(data: SaveData, result: Pick<RaceResults, "outcome" | "time" | "position">): SaveData {
  if (result.outcome !== "finished") return data;
  const { time, position } = data.personalBest;
  return {
    ...data,
    personalBest: {
      time: result.time !== null && (time === null || result.time < time) ? result.time : time,
      position: result.position !== null && (position === null || result.position < position) ? result.position : position,
    },
  };
}

/** The fields of a plain object, or none for anything else. */
function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isVolume(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * Whether the game reduces motion: the player's choice once they have made
 * one, and until then whatever the operating system prefers.
 */
export function isMotionReduced(settings: Settings, systemPrefersReducedMotion: boolean): boolean {
  return settings.reduceMotion ?? systemPrefersReducedMotion;
}

/** Writes the save data. Returns whether it was stored; never throws. */
export function storeSaveData(storage: SaveStorage | undefined, data: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
