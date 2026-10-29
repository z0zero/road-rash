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

/** Starts a race and plays through its countdown, stopping while "GO!" shows. */
async function startRacing(page: Page) {
  await startRace(page);
  await play(page, 3.6);
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
  await play(page, 3);
  await page.keyboard.up("w");

  expect(await hudSpeed(page)).toBeGreaterThan(40);
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
    await play(page, 0.4);
  }
  await page.keyboard.up("w");

  expect(await hudSpeed(page)).toBeGreaterThan(0);
});

test("opens Settings from the title screen and goes back", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("switch", { name: "Reduce motion" })).toBeVisible();

  await settings.getByRole("button", { name: "Back" }).click();
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

test.describe("when the operating system prefers reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("starts with Reduce motion on", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeChecked();
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
