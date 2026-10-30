import { expect, test, type Page } from "@playwright/test";

/** Console errors and uncaught exceptions seen by the current test. */
let errors: string[] = [];

/**
 * Every page runs on Playwright's clock, from this time. The clock runs freely
 * until a test starts a race, then stops, and moves on only as the test plays
 * the race on (see `startRace` and `play`). What a test sees after a second of
 * play is then the same however slowly the machine draws: a software renderer,
 * as on CI, can take a third of a second to draw a frame.
 */
const PAGE_OPENS = new Date("2026-06-01T18:00:00Z");
/** Where the clock stops when a test starts a race: any time after the page has loaded. */
const RACE_STARTS = new Date("2026-06-01T19:00:00Z");
/**
 * How far each frame of play moves the clock on, in milliseconds: few frames,
 * so that play is quick where frames are slow to draw, each short enough for
 * the game to count it in full.
 */
const FRAME_MS = 200;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: PAGE_OPENS });
  await page.goto("/");
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("shows the title screen with a Start Race button", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Rev & Wreck" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

/** Stops the page's clock and starts a race, which then moves only as the test plays it on. */
async function startRace(page: Page) {
  await page.clock.pauseAt(RACE_STARTS);
  await page.getByRole("button", { name: "Start Race" }).click();
}

/** Plays the race on by `seconds`, a frame at a time. */
async function play(page: Page, seconds: number) {
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let frame = 0; frame < frames; frame++) await page.clock.fastForward(FRAME_MS);
}

test("counts down 3-2-1 after Start Race, then shows the HUD", async ({ page }) => {
  await startRace(page);

  const countdown = page.getByTestId("countdown");
  await play(page, 0.6);
  await expect(countdown).toHaveText("3");
  await play(page, 1);
  await expect(countdown).toHaveText("2");
  await play(page, 1);
  await expect(countdown).toHaveText("1");
  await play(page, 1);
  await expect(countdown).toHaveText("GO!");
  await expect(page.getByTestId("speed")).toHaveText("0");
  await expect(page.getByText("km/h")).toBeVisible();
  await expect(page.getByTestId("progress")).toBeVisible();
});

test("shows the 3 for its full second even when the race's first frame is slow to draw", async ({ page }) => {
  await startRace(page);

  // The race's first frame, then the next, after the first took three seconds
  // to draw, as compiling shaders can on a modest machine.
  await page.clock.fastForward(FRAME_MS);
  await page.clock.fastForward(3000);
  const countdown = page.getByTestId("countdown");
  await play(page, 0.8);
  await expect(countdown).toHaveText("3");
  await play(page, 0.4);
  await expect(countdown).toHaveText("2");
});

/** Starts a race and plays through its countdown, stopping while "GO!" shows. */
async function startRacing(page: Page) {
  await startRace(page);
  await play(page, 3.6);
  await expect(page.getByTestId("countdown")).toHaveText("GO!");
}

async function hudSpeedKmh(page: Page) {
  return Number(await page.getByTestId("speed").textContent());
}

test("shows the player's position out of fifteen, starting last, and a progress marker for every rider", async ({
  page,
}) => {
  await startRacing(page);

  await expect(page.getByTestId("position")).toHaveText("15/15");
  await expect(page.getByTestId("player-marker")).toHaveCount(1);
  await expect(page.getByTestId("rider-marker")).toHaveCount(14);
});

test("raises the HUD's speed while the throttle is held", async ({ page }) => {
  await startRacing(page);
  expect(await hudSpeedKmh(page)).toBe(0);

  await page.keyboard.down("w");
  await play(page, 3);
  await page.keyboard.up("w");

  expect(await hudSpeedKmh(page)).toBeGreaterThan(40);
});

test("pauses on Esc, offering resume, restart and quit to title", async ({ page }) => {
  await startRacing(page);

  await page.keyboard.press("Escape");

  const menu = page.getByRole("dialog", { name: "Paused" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Restart" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Quit to title" })).toBeVisible();

  await page.keyboard.press("p");
  await expect(menu).toBeHidden();
  await page.keyboard.press("p");
  await expect(menu).toBeVisible();

  await menu.getByRole("button", { name: "Quit to title" }).click();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

test("shows the race's seed on the pause menu, and races the seed the page's address asks for", async ({ page }) => {
  await page.goto("/?seed=1234");
  await startRacing(page);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Paused" }).getByTestId("race-seed")).toHaveText(/^Race seed 1234$/i);
});

test("pauses by itself when the browser tab is hidden", async ({ page }) => {
  await startRacing(page);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
});

test("shows the player's stamina and bike condition, full at the start", async ({ page }) => {
  await startRacing(page);

  await expect(page.getByRole("meter", { name: "Stamina", exact: true })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("meter", { name: "Bike condition", exact: true })).toHaveAttribute("aria-valuenow", "100");
});

test("starts the player without a club, so the HUD's club icon is hidden", async ({ page }) => {
  await startRacing(page);

  await expect(page.getByTestId("club")).toHaveCount(1);
  await expect(page.getByTestId("club")).toBeHidden();
});

test("starts with the cops waiting far up the road, so the HUD's cop alert is hidden", async ({ page }) => {
  await startRacing(page);
  await page.keyboard.down("w");
  await play(page, 2);
  await page.keyboard.up("w");

  await expect(page.getByTestId("cop-alert")).toHaveCount(1);
  await expect(page.getByTestId("cop-alert")).toBeHidden();
});

test("punches and kicks with J and K while riding", async ({ page }) => {
  await startRacing(page);
  await page.keyboard.down("w");

  for (const key of ["j", "k", "z", "x"]) {
    await page.keyboard.press(key);
    await play(page, 0.4);
  }
  await page.keyboard.up("w");

  expect(await hudSpeedKmh(page)).toBeGreaterThan(0);
});

/** Buttons of the standard gamepad mapping, named as on an Xbox controller. */
const GAMEPAD = { a: 0, b: 1, x: 2, leftTrigger: 6, rightTrigger: 7, start: 9, up: 12, down: 13, left: 14, right: 15 };

/** What the fake gamepad lets a test do: hold and let go of its buttons, push its left stick, and unplug it and plug it back in. */
interface FakeGamepad {
  press(button: number, value?: number): void;
  release(button: number): void;
  push(x: number, y: number): void;
  unplug(): void;
  plugIn(): void;
}

declare global {
  interface Window {
    /** Set in the page by `plugInAGamepad`; the game itself never has it. */
    fakeGamepad?: FakeGamepad;
  }
}

/** Runs in the page before its scripts: one gamepad with the standard mapping, which the test works through `window.fakeGamepad`. */
function plugInAGamepad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  const pad = { id: "Fake gamepad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes, buttons };
  Object.defineProperty(Navigator.prototype, "getGamepads", {
    configurable: true,
    value: () => [pad, null, null, null],
  });
  window.fakeGamepad = {
    press: (button, value = 1) => {
      buttons[button] = { pressed: true, touched: true, value };
      pad.timestamp++;
    },
    release: (button) => {
      buttons[button] = { pressed: false, touched: false, value: 0 };
      pad.timestamp++;
    },
    push: (x, y) => {
      axes[0] = x;
      axes[1] = y;
      pad.timestamp++;
    },
    unplug: () => {
      pad.connected = false;
    },
    plugIn: () => {
      pad.connected = true;
      pad.timestamp++;
    },
  };
}

/** The page's fake gamepad, from the test. */
function gamepad(page: Page) {
  return {
    press: (button: number, value = 1) =>
      page.evaluate(([b, v]) => {
        if (!window.fakeGamepad) throw new Error("No gamepad plugged in: add plugInAGamepad first");
        window.fakeGamepad.press(b, v);
      }, [button, value]),
    release: (button: number) =>
      page.evaluate((b) => {
        if (!window.fakeGamepad) throw new Error("No gamepad plugged in: add plugInAGamepad first");
        window.fakeGamepad.release(b);
      }, button),
    push: (x: number, y: number) =>
      page.evaluate(([px, py]) => {
        if (!window.fakeGamepad) throw new Error("No gamepad plugged in: add plugInAGamepad first");
        window.fakeGamepad.push(px, py);
      }, [x, y]),
    unplug: () =>
      page.evaluate(() => {
        if (!window.fakeGamepad) throw new Error("No gamepad plugged in: add plugInAGamepad first");
        window.fakeGamepad.unplug();
      }),
    plugIn: () =>
      page.evaluate(() => {
        if (!window.fakeGamepad) throw new Error("No gamepad plugged in: add plugInAGamepad first");
        window.fakeGamepad.plugIn();
      }),
  };
}

test.describe("with a gamepad", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(plugInAGamepad);
    await page.reload();
  });

  test("throttles on the right trigger or A, brakes on the left trigger and pauses on Start", async ({ page }) => {
    await startRacing(page);

    await gamepad(page).press(GAMEPAD.rightTrigger);
    await play(page, 3);
    const fastKmh = await hudSpeedKmh(page);
    expect(fastKmh).toBeGreaterThan(40);
    await gamepad(page).release(GAMEPAD.rightTrigger);
    await gamepad(page).press(GAMEPAD.leftTrigger);
    await play(page, 1);
    const brakedKmh = await hudSpeedKmh(page);
    expect(brakedKmh).toBeLessThan(fastKmh - 25);
    await gamepad(page).release(GAMEPAD.leftTrigger);
    await gamepad(page).press(GAMEPAD.a);
    await play(page, 2);
    expect(await hudSpeedKmh(page)).toBeGreaterThan(brakedKmh + 15);

    await gamepad(page).press(GAMEPAD.start);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.start);
    await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  });

  test("lets go of every held control while the window has lost focus", async ({ page }) => {
    await startRacing(page);
    await page.keyboard.down("w");
    await gamepad(page).press(GAMEPAD.rightTrigger);
    await play(page, 3);
    const ridingKmh = await hudSpeedKmh(page);

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await play(page, 2);
    const coastingKmh = await hudSpeedKmh(page);
    expect(coastingKmh).toBeLessThan(ridingKmh);

    // The gamepad's trigger, still held, counts again once the window has focus back.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await play(page, 2);
    expect(await hudSpeedKmh(page)).toBeGreaterThan(coastingKmh + 10);
    await page.keyboard.up("w");
  });

  /**
   * Waits for the page's next animation frames, by when the game has read the
   * gamepad again: it reads it once a frame, so a button let go of and pressed
   * again between two frames would look held all along.
   */
  function nextFrames(page: Page) {
    return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  /** Presses a gamepad button, waits for what it does, then lets go, and waits for the game to have seen it let go. */
  async function tap(page: Page, button: number, then: () => Promise<void>) {
    await gamepad(page).press(button);
    await then();
    await gamepad(page).release(button);
    await nextFrames(page);
  }

  test("moves between menu buttons with the D-pad or the left stick, and presses them with A", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();

    await tap(page, GAMEPAD.down, () => expect(page.getByRole("button", { name: "Controls" })).toBeFocused());
    await gamepad(page).push(0, 1);
    await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
    await gamepad(page).push(0, 0);
    await nextFrames(page);
    await tap(page, GAMEPAD.up, () => expect(page.getByRole("button", { name: "Controls" })).toBeFocused());
    const controls = page.getByRole("dialog", { name: "Controls" });
    await tap(page, GAMEPAD.a, () => expect(controls).toBeVisible());

    // Back is in focus on the Controls screen.
    await tap(page, GAMEPAD.a, () => expect(controls).toBeHidden());
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  });

  test("counts the press that shows a gamepad to the page, as a browser does with its first press", async ({ page }) => {
    await gamepad(page).unplug();
    await nextFrames(page);
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();

    await gamepad(page).press(GAMEPAD.a);
    await gamepad(page).plugIn();

    await expect(page.getByTestId("countdown")).toBeVisible();
  });

  test("doesn't press a button again for its being held through a lost focus", async ({ page }) => {
    await tap(page, GAMEPAD.down, () => expect(page.getByRole("button", { name: "Controls" })).toBeFocused());
    const controls = page.getByRole("dialog", { name: "Controls" });
    await gamepad(page).press(GAMEPAD.a);
    await expect(controls).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await nextFrames(page);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await nextFrames(page);

    // A, held all along, didn't press Back, which has the focus on the Controls screen.
    await expect(controls).toBeVisible();
    await gamepad(page).release(GAMEPAD.a);
  });

  test("moves through a menu once for a stick wavering at the edge of a push", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();

    await gamepad(page).push(0, 0.7);
    await expect(page.getByRole("button", { name: "Controls" })).toBeFocused();
    for (const y of [0.5, 0.7, 0.5, 0.7]) {
      await gamepad(page).push(0, y);
      await nextFrames(page);
    }

    await expect(page.getByRole("button", { name: "Controls" })).toBeFocused();
    await gamepad(page).push(0, 0);
  });

  test("turns a volume slider in focus with the D-pad", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    const master = page.getByRole("dialog", { name: "Settings" }).getByRole("slider", { name: "Master volume" });

    // From Back, the last button, down comes round to the first slider.
    await tap(page, GAMEPAD.down, () => expect(master).toBeFocused());
    await tap(page, GAMEPAD.left, () => expect(master).toHaveValue("95"));
    await tap(page, GAMEPAD.left, () => expect(master).toHaveValue("90"));
    await tap(page, GAMEPAD.right, () => expect(master).toHaveValue("95"));
  });
});

test("opens Settings from the title screen and goes back", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("switch", { name: "Reduce motion" })).toBeVisible();

  await settings.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

test("credits the music and disclaims any tie to Road Rash, from the title screen", async ({ page }) => {
  await page.getByRole("button", { name: "Credits" }).click();

  const credits = page.getByRole("dialog", { name: "Credits" });
  await expect(credits).toBeVisible();
  await expect(credits.getByText("MintoDog")).toBeVisible();
  await expect(credits.getByText("CC0")).toBeVisible();
  await expect(credits).toContainText("inspired by Road Rash");
  await expect(credits).toContainText("not affiliated with Road Rash or Electronic Arts");

  await credits.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

test("lists the keyboard and gamepad controls, from the title screen", async ({ page }) => {
  await page.getByRole("button", { name: "Controls" }).click();

  const controls = page.getByRole("dialog", { name: "Controls" });
  await expect(controls).toBeVisible();
  await expect(controls.getByRole("columnheader", { name: "Keyboard" })).toBeVisible();
  await expect(controls.getByRole("columnheader", { name: "Gamepad" })).toBeVisible();
  // The bindings from the spec: each action, its keys, then its gamepad controls.
  const bindings = [
    ["Throttle", ["W", "↑"], ["Right trigger", "A"]],
    ["Brake", ["S", "↓"], ["Left trigger"]],
    ["Steer", ["A", "D", "←", "→"], ["Left stick", "D-pad"]],
    ["Punch, or swing a club", ["J", "Z"], ["X"]],
    ["Kick", ["K", "X"], ["B"]],
    ["Pause", ["Esc", "P"], ["Start"]],
  ] as const;
  for (const [action, keys, buttons] of bindings) {
    const row = controls.getByRole("row").filter({ has: page.getByRole("rowheader", { name: action, exact: true }) });
    await expect(row.getByRole("cell").nth(0).locator("kbd")).toHaveText(keys);
    await expect(row.getByRole("cell").nth(1).locator("kbd")).toHaveText(buttons);
  }

  await controls.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

test("remembers Reduce motion after a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const reduceMotion = page.getByRole("switch", { name: "Reduce motion" });
  await expect(reduceMotion).not.toBeChecked();

  await reduceMotion.click();
  await expect(reduceMotion).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeChecked();
});

test("remembers the master, music and effects volumes after a reload", async ({ page }) => {
  const volumes = () => {
    const settings = page.getByRole("dialog", { name: "Settings" });
    return ["Master volume", "Music volume", "Effects volume"].map((name) => settings.getByRole("slider", { name }));
  };
  await page.getByRole("button", { name: "Settings" }).click();
  const [master, music, effects] = volumes();
  await expect(master).toHaveValue("100");
  await expect(music).toHaveValue("70");
  await expect(effects).toHaveValue("100");

  await master.press("ArrowLeft");
  await music.press("Home");
  await effects.press("ArrowLeft");
  await effects.press("ArrowLeft");
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();

  const [masterAfter, musicAfter, effectsAfter] = volumes();
  await expect(masterAfter).toHaveValue("95");
  await expect(musicAfter).toHaveValue("0");
  await expect(effectsAfter).toHaveValue("90");
});

test.describe("when the operating system prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("starts with Reduce motion on", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeChecked();
  });
});

test("fetches a music track of at most 3 MB once the title screen is up", async ({ page }) => {
  const music = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(".mp3"));
  await page.reload();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();

  const response = await music;
  expect(response.ok()).toBe(true);
  // Fetched by the game once it runs, not preloaded by the page.
  expect(response.request().resourceType()).toBe("fetch");
  expect((await response.body()).byteLength).toBeLessThanOrEqual(3_000_000);
});

/** What the sound spy saw: every audio context the page made, and an analyser on everything sent to the speakers. */
interface SoundSpy {
  contexts: AudioContext[];
  outputs: AnalyserNode[];
}

declare global {
  interface Window {
    /** Set in the page by `spyOnSound`; the game itself never has it. */
    soundSpy?: SoundSpy;
  }
}

/** Runs in the page before its scripts: spies on Web Audio without changing what it does. */
function spyOnSound() {
  const spy: SoundSpy = { contexts: [], outputs: [] };
  window.soundSpy = spy;
  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    constructor(options?: AudioContextOptions) {
      super(options);
      spy.contexts.push(this);
    }
  };
  const connect = AudioNode.prototype.connect;
  // Replaced as a property and called through Reflect: the method is overloaded, so no one signature fits it.
  Object.defineProperty(AudioNode.prototype, "connect", {
    configurable: true,
    writable: true,
    value(this: AudioNode, ...args: unknown[]): unknown {
      if (args[0] instanceof AudioDestinationNode) {
        const output = this.context.createAnalyser();
        Reflect.apply(connect, this, [output]);
        spy.outputs.push(output);
      }
      return Reflect.apply(connect, this, args);
    },
  });
}

/** The state of every audio context the page made, oldest first. */
function audioStates(page: Page) {
  return page.evaluate(() => {
    if (!window.soundSpy) throw new Error("No spy on the sound: add spyOnSound first");
    return window.soundSpy.contexts.map((context) => context.state);
  });
}

/** The loudest sample going to the speakers right now, from 0 (silence) up. */
function loudness(page: Page) {
  return page.evaluate(() => {
    if (!window.soundSpy) throw new Error("No spy on the sound: add spyOnSound first");
    let peak = 0;
    for (const output of window.soundSpy.outputs) {
      const samples = new Float32Array(output.fftSize);
      output.getFloatTimeDomainData(samples);
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    }
    return peak;
  });
}

test.describe("sound", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(spyOnSound);
    await page.reload();
  });

  test("starts with the Start Race click", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
    expect(await audioStates(page)).not.toContain("running");

    await page.getByRole("button", { name: "Start Race" }).click();

    await expect.poll(() => audioStates(page)).toEqual(["running"]);
    await expect.poll(() => loudness(page), { timeout: 10_000 }).toBeGreaterThan(0.01);
  });
});

/** Runs in the page before its scripts: a browser that refuses to make audio contexts. */
function refuseAudio() {
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: class {
      constructor() {
        throw new DOMException("Audio is blocked here.", "NotAllowedError");
      }
    },
  });
}

/** Runs in the page before its scripts: a browser that makes audio contexts but never lets them play. */
function neverPlayAudio() {
  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    constructor(options?: AudioContextOptions) {
      super(options);
      void super.suspend();
    }
    resume() {
      return Promise.reject(new DOMException("Audio is blocked here.", "NotAllowedError"));
    }
  };
}

for (const [behaviour, blockAudio] of [
  ["refuses to make audio", refuseAudio],
  ["never lets audio play", neverPlayAudio],
] as const) {
  test(`races without errors when the browser ${behaviour}`, async ({ page }) => {
    await page.addInitScript(blockAudio);
    await page.reload();

    await startRacing(page);
    await page.keyboard.down("w");
    await play(page, 3);
    expect(await hudSpeedKmh(page)).toBeGreaterThan(40);
    await page.keyboard.up("w");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Restart" }).click();
    await play(page, 0.2);
    await expect(page.getByTestId("countdown")).not.toBeEmpty();
  });
}

/** Runs in the page before its scripts: a browser without WebGL 2, or with it turned off. */
function withoutWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value(this: HTMLCanvasElement, type: string, ...options: unknown[]): unknown {
      return type === "webgl2" ? null : Reflect.apply(getContext, this, [type, ...options]);
    },
  });
}

test("explains that the game needs a newer browser where there is no WebGL 2", async ({ page }) => {
  await page.addInitScript(withoutWebGL2);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Rev & Wreck needs a newer browser" })).toBeVisible();
  await expect(page.getByText(/WebGL\s2/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test.describe("on a touch-only phone or tablet", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("explains that the game is made for desktop, with a keyboard or gamepad", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Rev & Wreck is made for desktop" })).toBeVisible();
    await expect(page.getByText(/keyboard or a gamepad/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Race" })).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("lets a player who has a keyboard or gamepad there play anyway, by pressing a key", async ({ page }) => {
    await expect(page.getByRole("button")).toHaveCount(0);

    await page.keyboard.press("Space");

    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
    await expect(page.getByTestId("countdown")).toHaveCount(0);
  });
});

test.describe("in a browser that can't run the game's scripts", () => {
  test.use({ javaScriptEnabled: false });

  test("asks for a recent browser once the game has been loading for a while", async ({ page }) => {
    const hint = page.getByText(/Still loading\? Rev & Wreck needs/);
    await expect(page.getByText("Loading…")).toBeVisible();
    await expect(hint).toBeHidden();

    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(hint).toContainText(/WebGL\s2/);
  });
});

test("downloads less than 10 MB to get racing", async ({ browser, baseURL }) => {
  // A fresh browser context, so nothing comes from the cache.
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const sizes: Promise<number>[] = [];
  page.on("requestfinished", (request) => sizes.push(request.sizes().then((size) => size.responseBodySize)));

  await page.clock.install({ time: PAGE_OPENS });
  await page.goto("/");
  await startRacing(page);
  await page.waitForLoadState("networkidle");

  const bytes = (await Promise.all(sizes)).reduce((total, size) => total + size, 0);
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(10 * 1024 * 1024);
  await context.close();
});

test("draws the race on a canvas", async ({ page }) => {
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});
