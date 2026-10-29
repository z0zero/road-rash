import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAVE_DATA,
  isMotionReduced,
  loadSaveData,
  recordRaceResult,
  storeSaveData,
  type SaveData,
  type SaveStorage,
} from "./save-data";

/** A stand-in for the browser's localStorage, backed by a Map the test can inspect and tamper with. */
function memoryStorage() {
  const backing = new Map<string, string>();
  const storage: SaveStorage = {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => void backing.set(key, value),
  };
  return { storage, backing };
}

/** A storage holding saved data whose text has been replaced with `text`. */
function storageHolding(text: string) {
  const { storage, backing } = memoryStorage();
  storeSaveData(storage, DEFAULT_SAVE_DATA);
  for (const key of backing.keys()) backing.set(key, text);
  return storage;
}

describe("save data", () => {
  it("gives the defaults when nothing has been saved", () => {
    expect(loadSaveData(memoryStorage().storage)).toEqual(DEFAULT_SAVE_DATA);
    expect(loadSaveData(undefined)).toEqual(DEFAULT_SAVE_DATA);
  });

  it("round-trips settings and the personal best under a single key", () => {
    const { storage, backing } = memoryStorage();
    const data: SaveData = {
      settings: { masterVolume: 0.4, musicVolume: 0, effectsVolume: 0.9, reduceMotion: true },
      personalBest: { time: 163.25, position: 2 },
    };

    expect(storeSaveData(storage, data)).toBe(true);

    expect(loadSaveData(storage)).toEqual(data);
    expect(backing.size).toBe(1);
  });

  it("falls back to the defaults when the saved data is corrupt", () => {
    for (const corrupt of ["{not json", "42", "null", '"text"', "[]", '{"settings":"loud","personalBest":7}']) {
      expect(loadSaveData(storageHolding(corrupt))).toEqual(DEFAULT_SAVE_DATA);
    }
  });

  it("keeps the valid parts of partly corrupt or incomplete data", () => {
    const storage = storageHolding(
      JSON.stringify({
        settings: { masterVolume: "loud", musicVolume: 0.25, effectsVolume: 7, reduceMotion: "yes" },
        personalBest: { time: 171.5 },
      }),
    );

    expect(loadSaveData(storage)).toEqual({
      settings: { ...DEFAULT_SAVE_DATA.settings, musicVolume: 0.25 },
      personalBest: { time: 171.5, position: null },
    });
  });

  it("never throws when storage does", () => {
    const refusing: SaveStorage = {
      getItem: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
    };

    expect(loadSaveData(refusing)).toEqual(DEFAULT_SAVE_DATA);
    expect(storeSaveData(refusing, DEFAULT_SAVE_DATA)).toBe(false);
  });
});

describe("the Reduce motion setting", () => {
  it("follows the operating system's preference until the player chooses", () => {
    const { settings } = loadSaveData(memoryStorage().storage);

    expect(isMotionReduced(settings, true)).toBe(true);
    expect(isMotionReduced(settings, false)).toBe(false);
  });

  it("keeps the player's choice after a reload, whatever the operating system prefers", () => {
    for (const choice of [true, false]) {
      const { storage } = memoryStorage();
      storeSaveData(storage, { ...DEFAULT_SAVE_DATA, settings: { ...DEFAULT_SAVE_DATA.settings, reduceMotion: choice } });
      const { settings } = loadSaveData(storage);

      expect(isMotionReduced(settings, true)).toBe(choice);
      expect(isMotionReduced(settings, false)).toBe(choice);
    }
  });
});

describe("the personal best", () => {
  const finished = (time: number, position: number) => ({ outcome: "finished" as const, time, position });
  const best = (data: SaveData) => data.personalBest;

  it("is set by the first finish", () => {
    expect(best(recordRaceResult(DEFAULT_SAVE_DATA, finished(180.5, 4)))).toEqual({ time: 180.5, position: 4 });
  });

  it("keeps the fastest time and the best position", () => {
    let data = recordRaceResult(DEFAULT_SAVE_DATA, finished(170, 3));

    data = recordRaceResult(data, finished(175, 5));
    expect(best(data)).toEqual({ time: 170, position: 3 });

    data = recordRaceResult(data, finished(168.2, 4));
    expect(best(data)).toEqual({ time: 168.2, position: 3 });

    data = recordRaceResult(data, finished(171, 1));
    expect(best(data)).toEqual({ time: 168.2, position: 1 });
  });

  it("is never set by a wrecked or busted race", () => {
    const data = recordRaceResult(DEFAULT_SAVE_DATA, finished(170, 3));

    for (const outcome of ["wrecked", "busted"] as const) {
      expect(best(recordRaceResult(data, { outcome, time: null, position: null }))).toEqual({ time: 170, position: 3 });
    }
  });

  it("leaves the settings alone", () => {
    const data: SaveData = { ...DEFAULT_SAVE_DATA, settings: { ...DEFAULT_SAVE_DATA.settings, musicVolume: 0.1 } };

    expect(recordRaceResult(data, finished(170, 3)).settings).toEqual(data.settings);
  });
});
