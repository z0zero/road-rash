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

  it("round-trips settings and the personal bests under a single key", () => {
    const { storage, backing } = memoryStorage();
    const data: SaveData = {
      settings: { masterVolume: 0.4, musicVolume: 0, effectsVolume: 0.9, reduceMotion: true, hasAttacked: true, difficulty: "hard" },
      personalBests: {
        easy: { time: 171.5, position: 1 },
        normal: { time: 163.25, position: 2 },
        hard: { time: null, position: null },
      },
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
        settings: { masterVolume: "loud", musicVolume: 0.25, effectsVolume: 7, reduceMotion: "yes", hasAttacked: 1, difficulty: "insane" },
        personalBests: { normal: { time: 171.5 }, hard: "fast" },
      }),
    );

    expect(loadSaveData(storage)).toEqual({
      settings: { ...DEFAULT_SAVE_DATA.settings, musicVolume: 0.25 },
      personalBests: { ...DEFAULT_SAVE_DATA.personalBests, normal: { time: 171.5, position: null } },
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

describe("remembering that the player has attacked in a race", () => {
  it("says they haven't until it is saved that they have, and says so after a reload", () => {
    const { storage } = memoryStorage();
    expect(loadSaveData(storage).settings.hasAttacked).toBe(false);

    storeSaveData(storage, { ...DEFAULT_SAVE_DATA, settings: { ...DEFAULT_SAVE_DATA.settings, hasAttacked: true } });

    expect(loadSaveData(storage).settings.hasAttacked).toBe(true);
  });
});

describe("the personal best", () => {
  const finished = (time: number, position: number) => ({ outcome: "finished" as const, time, position });
  const best = (data: SaveData) => data.personalBests.normal;

  it("is set by the first finish", () => {
    expect(best(recordRaceResult(DEFAULT_SAVE_DATA, "normal", finished(180.5, 4)))).toEqual({ time: 180.5, position: 4 });
  });

  it("keeps the fastest time and the best position", () => {
    let data = recordRaceResult(DEFAULT_SAVE_DATA, "normal", finished(170, 3));

    data = recordRaceResult(data, "normal", finished(175, 5));
    expect(best(data)).toEqual({ time: 170, position: 3 });

    data = recordRaceResult(data, "normal", finished(168.2, 4));
    expect(best(data)).toEqual({ time: 168.2, position: 3 });

    data = recordRaceResult(data, "normal", finished(171, 1));
    expect(best(data)).toEqual({ time: 168.2, position: 1 });
  });

  it("is never set by a wrecked or busted race", () => {
    const data = recordRaceResult(DEFAULT_SAVE_DATA, "normal", finished(170, 3));

    for (const outcome of ["wrecked", "busted"] as const) {
      expect(best(recordRaceResult(data, "normal", { outcome, time: null, position: null }))).toEqual({ time: 170, position: 3 });
    }
  });

  it("is kept for each difficulty apart: a race counts only towards its own difficulty's", () => {
    let data = recordRaceResult(DEFAULT_SAVE_DATA, "normal", finished(185, 4));

    data = recordRaceResult(data, "easy", finished(200, 1));
    data = recordRaceResult(data, "hard", finished(181, 9));

    expect(data.personalBests).toEqual({
      easy: { time: 200, position: 1 },
      normal: { time: 185, position: 4 },
      hard: { time: 181, position: 9 },
    });
  });

  it("leaves the settings alone", () => {
    const data: SaveData = { ...DEFAULT_SAVE_DATA, settings: { ...DEFAULT_SAVE_DATA.settings, musicVolume: 0.1 } };

    expect(recordRaceResult(data, "normal", finished(170, 3)).settings).toEqual(data.settings);
  });
});

describe("the chosen difficulty", () => {
  it("is Normal until the player chooses another, and is remembered after a reload", () => {
    const { storage } = memoryStorage();
    expect(loadSaveData(storage).settings.difficulty).toBe("normal");

    storeSaveData(storage, { ...DEFAULT_SAVE_DATA, settings: { ...DEFAULT_SAVE_DATA.settings, difficulty: "easy" } });

    expect(loadSaveData(storage).settings.difficulty).toBe("easy");
  });
});

describe("a save from v1.0.0", () => {
  /** A storage holding what v1.0.0 saved, under its key, as `text`. */
  function storageFromV1(text: string) {
    const { storage, backing } = memoryStorage();
    backing.set("rev-and-wreck:v1", text);
    return { storage, backing };
  }

  const V1_SAVE = {
    settings: { masterVolume: 0.4, musicVolume: 0.3, effectsVolume: 0.9, reduceMotion: true, hasAttacked: true },
    personalBest: { time: 182.75, position: 2 },
  };

  it("keeps its settings, and its personal best becomes Normal's, the only race there was", () => {
    const { storage } = storageFromV1(JSON.stringify(V1_SAVE));

    expect(loadSaveData(storage)).toEqual({
      settings: { ...V1_SAVE.settings, difficulty: "normal" },
      personalBests: { ...DEFAULT_SAVE_DATA.personalBests, normal: { time: 182.75, position: 2 } },
    });
  });

  it("is left behind once the game saves again, its personal best carried over", () => {
    const { storage } = storageFromV1(JSON.stringify(V1_SAVE));
    const migrated = loadSaveData(storage);

    storeSaveData(storage, recordRaceResult(migrated, "hard", { outcome: "finished", time: 190, position: 5 }));
    const reloaded = loadSaveData(storage);

    expect(reloaded.personalBests.normal).toEqual({ time: 182.75, position: 2 });
    expect(reloaded.personalBests.hard).toEqual({ time: 190, position: 5 });
  });

  it("gives the defaults if it is corrupt, as any save would", () => {
    expect(loadSaveData(storageFromV1("{not json").storage)).toEqual(DEFAULT_SAVE_DATA);
  });
});
