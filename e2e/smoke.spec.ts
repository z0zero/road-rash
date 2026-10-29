import { expect, test, type Page } from "@playwright/test";

/** Console errors and uncaught exceptions seen by the current test. */
let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("shows the title screen with a Start Race button", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Rev & Wreck" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

test("counts down 3-2-1 after Start Race, then shows the HUD", async ({ page }) => {
  await page.getByRole("button", { name: "Start Race" }).click();

  const countdown = page.getByTestId("countdown");
  await expect(countdown).toHaveText("3");
  await expect(countdown).toHaveText("2");
  await expect(countdown).toHaveText("1");
  await expect(countdown).toHaveText("GO!");
  await expect(page.getByTestId("speed")).toHaveText("0");
  await expect(page.getByText("km/h")).toBeVisible();
  await expect(page.getByTestId("progress")).toBeVisible();
});

/** Starts a race and waits for the countdown to run out. */
async function startRacing(page: Page) {
  await page.getByRole("button", { name: "Start Race" }).click();
  await expect(page.getByTestId("countdown")).toHaveText("GO!");
}

async function hudSpeed(page: Page) {
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
  expect(await hudSpeed(page)).toBe(0);

  await page.keyboard.down("w");
  await expect.poll(() => hudSpeed(page), { timeout: 10_000 }).toBeGreaterThan(40);
  await page.keyboard.up("w");
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

test("punches and kicks with J and K while riding", async ({ page }) => {
  await startRacing(page);
  await page.keyboard.down("w");

  for (const key of ["j", "k", "z", "x"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }
  await page.keyboard.up("w");

  await expect.poll(() => hudSpeed(page)).toBeGreaterThan(0);
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
  await expect(credits.getByText("Joth")).toBeVisible();
  await expect(credits.getByText("CC0")).toBeVisible();
  await expect(credits).toContainText("inspired by Road Rash");
  await expect(credits).toContainText("not affiliated with Road Rash or Electronic Arts");

  await credits.getByRole("button", { name: "Back" }).click();
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
    /** Set in the page by `spyOnSound`. */
    soundSpy: SoundSpy;
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
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    if (args[0] instanceof AudioDestinationNode) {
      const output = this.context.createAnalyser();
      connect.call(this, output);
      spy.outputs.push(output);
    }
    return connect.apply(this, args);
  } as typeof AudioNode.prototype.connect;
}

/** The state of every audio context the page made, oldest first. */
function audioStates(page: Page) {
  return page.evaluate(() => window.soundSpy.contexts.map((context) => context.state));
}

/** The loudest sample going to the speakers right now, from 0 (silence) up. */
function loudness(page: Page) {
  return page.evaluate(() => {
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
  window.AudioContext = class {
    constructor() {
      throw new DOMException("Audio is blocked here.", "NotAllowedError");
    }
  } as unknown as typeof AudioContext;
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
    await expect.poll(() => hudSpeed(page), { timeout: 10_000 }).toBeGreaterThan(40);
    await page.keyboard.up("w");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Restart" }).click();
    await expect(page.getByTestId("countdown")).not.toBeEmpty();
  });
}

test("downloads less than 10 MB to get racing", async ({ browser, baseURL }) => {
  // A fresh browser context, so nothing comes from the cache.
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const sizes: Promise<number>[] = [];
  page.on("requestfinished", (request) => sizes.push(request.sizes().then((size) => size.responseBodySize)));

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
