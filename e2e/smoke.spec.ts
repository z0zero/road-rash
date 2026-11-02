import { expect, test, type Locator, type Page } from "@playwright/test";

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
/** Where the clock stops when a test starts a race: any time after the title screen is up. */
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

/**
 * Stops the page's clock at `at`, once the title screen is up. The game comes
 * up after the page has loaded, on the page's timers, so a clock stopped any
 * sooner, as on a slow machine, holds the title screen back for good.
 */
async function stopTheClockOnTheTitle(page: Page, at = RACE_STARTS) {
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible({ timeout: 15_000 });
  await page.clock.pauseAt(at);
}

/** Stops the page's clock and starts a race, which then moves only as the test plays it on. */
async function startRace(page: Page) {
  await stopTheClockOnTheTitle(page);
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

for (const viewport of [
  { width: 1280, height: 577 },
  { width: 1024, height: 576 },
]) {
  test.describe(`in a window ${viewport.width}x${viewport.height}, as a laptop's browser at 150% scaling leaves`, () => {
    test.use({ viewport });

    test("fits the title screen in, from the game's title to the personal best", async ({ page }) => {
      await page.evaluate(() =>
        localStorage.setItem("rev-and-wreck:v2", JSON.stringify({ personalBests: { normal: { time: 185.25, position: 4 } } })),
      );
      await page.reload();

      await expect(page.getByRole("heading", { name: "Rev & Wreck" })).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId("title-personal-best")).toBeInViewport({ ratio: 1 });
    });

    test("fits the Controls screen in, from its title to Back", async ({ page }) => {
      await page.getByRole("button", { name: "Controls" }).click();

      const controls = page.getByRole("dialog", { name: "Controls" });
      await expect(controls.getByRole("heading", { name: "Controls" })).toBeInViewport({ ratio: 1 });
      await expect(controls.getByRole("button", { name: "Back" })).toBeInViewport({ ratio: 1 });
    });

    test("fits a race's results in, from the banner to the race's seed", async ({ page }) => {
      // Half a minute of racing, a frame at a time.
      test.slow();
      const results = await wreckedEarly(page);
      await play(page, 1.6);
      await expect(results.getByRole("button", { name: "Restart" })).toBeFocused();

      // The panel, frame and all, with the banner at its top and the race's seed at the foot of its buttons.
      await expect(results.locator(":scope > div")).toBeInViewport({ ratio: 1 });
    });
  });
}

/**
 * The size of a screen's overlay (`clientWidth`, `clientHeight`) and of all it
 * holds (`scrollWidth`, `scrollHeight`), which is larger where the screen
 * doesn't fit in the window and the overlay scrolls.
 */
function scrollSizes(screen: Locator) {
  return screen.evaluate(({ scrollWidth, scrollHeight, clientWidth, clientHeight }) => ({
    scrollWidth,
    scrollHeight,
    clientWidth,
    clientHeight,
  }));
}

for (const viewport of [
  { width: 1280, height: 577 },
  { width: 1024, height: 576 },
  // As a 1366x768 laptop's maximized browser leaves.
  { width: 1366, height: 657 },
  // The shortest window with the screens' full spacing.
  { width: 1280, height: 768 },
]) {
  test.describe(`in a window ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("fits the Controls screen in without scrolling it", async ({ page }) => {
      await page.getByRole("button", { name: "Controls" }).click();

      const controls = page.getByRole("dialog", { name: "Controls" });
      await expect(controls.getByRole("button", { name: "Back" })).toBeFocused();
      const { scrollHeight, clientHeight } = await scrollSizes(controls);
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
    });
  });
}

test.describe("in a window 1280x641, too short for the title screen with its full spacing", () => {
  test.use({ viewport: { width: 1280, height: 641 } });

  test("fits the title screen in without scrolling it, down to the personal best", async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("rev-and-wreck:v2", JSON.stringify({ personalBests: { normal: { time: 185.25, position: 4 } } })),
    );
    await page.reload();

    await expect(page.getByTestId("title-personal-best")).toBeVisible();
    const { scrollHeight, clientHeight } = await scrollSizes(page.getByTestId("title-screen"));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  });
});

test.describe("in a window 480x800, as a browser snapped to a third of a wide screen leaves", () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test("fits the Controls screen's width in, without scrolling it sideways", async ({ page }) => {
    await page.getByRole("button", { name: "Controls" }).click();

    const controls = page.getByRole("dialog", { name: "Controls" });
    await expect(controls.getByRole("button", { name: "Back" })).toBeFocused();
    const { scrollWidth, clientWidth } = await scrollSizes(controls);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("fits a race's results' width in, without scrolling them sideways, and all of them in a window resized to 1280x768, the shortest with the screens' full spacing", async ({
    page,
  }) => {
    // Half a minute of racing, a frame at a time.
    test.slow();
    const results = await wreckedEarly(page);
    await play(page, 1.6);
    await expect(results.getByRole("button", { name: "Restart" })).toBeFocused();

    const { scrollWidth, clientWidth } = await scrollSizes(results);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Resized, the results lay out as they would if they had opened at that size, so one ride checks both windows.
    await page.setViewportSize({ width: 1280, height: 768 });
    const { scrollHeight, clientHeight } = await scrollSizes(results);
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  });
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

test("pauses and resumes with an Esc that the keyboard's layout puts on another key", async ({ page }) => {
  await startRace(page);
  await play(page, 0.2);
  const menu = page.getByRole("dialog", { name: "Paused" });

  await pressEscOnCapsLock(page);
  await expect(menu).toBeVisible();
  await pressEscOnCapsLock(page);
  await expect(menu).toBeHidden();
});

test("shows the race's seed on the pause menu: the one the page's address asks for", async ({ page }) => {
  await page.goto("/?seed=1234");
  await startRacing(page);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Paused" }).getByTestId("race-seed")).toHaveText(/^Race seed 1234$/i);
});

/** The difficulty under Start Race on the title screen: its choices are radios, named after their difficulty. */
function difficultyChoices(page: Page) {
  return page.getByRole("group", { name: "Difficulty" });
}

test("chooses the difficulty under Start Race with the mouse or the arrow keys, remembers it, and shows it on the pause menu", async ({
  page,
}) => {
  // A reload, then a race's countdown, a frame at a time: a busy machine takes a while.
  test.slow();
  const difficulty = difficultyChoices(page);
  await expect(difficulty.getByRole("radio", { name: "Normal" })).toBeChecked();

  await difficulty.getByText("Easy").click();
  await expect(difficulty.getByRole("radio", { name: "Easy" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(difficulty.getByRole("radio", { name: "Normal" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(difficulty.getByRole("radio", { name: "Hard" })).toBeChecked();

  await page.reload();
  await expect(difficultyChoices(page).getByRole("radio", { name: "Hard" })).toBeChecked();
  await startRacing(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paused" }).getByTestId("race-difficulty")).toHaveText(/^Hard$/i);
});

test("moves the difficulty with the arrow keys as the D-pad does, stopping at the ends, and leaves it with up and down", async ({
  page,
}) => {
  const choice = (name: string) => difficultyChoices(page).getByRole("radio", { name });
  await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(choice("Normal")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(choice("Hard")).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(choice("Hard")).toBeChecked();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Controls" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(choice("Easy")).toBeChecked();
  await expect(choice("Easy")).toBeFocused();
});

test("moves through the menus with the arrow keys as the D-pad does, both ways past the difficulty, and still rides with them", async ({
  page,
}) => {
  // A dozen key presses, then a race's countdown and a few seconds of it, a frame at a time.
  test.slow();
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const normal = difficultyChoices(page).getByRole("radio", { name: "Normal" });
  await expect(button("Start Race")).toBeFocused();

  // Down and up move through the title's menu, the difficulty one stop in it, without changing it.
  for (const [key, focused] of [
    ["ArrowDown", normal],
    ["ArrowDown", button("Controls")],
    ["ArrowDown", button("Settings")],
    ["ArrowUp", button("Controls")],
    ["ArrowUp", normal],
    ["ArrowUp", button("Start Race")],
  ] as const) {
    await page.keyboard.press(key);
    await expect(focused).toBeFocused();
  }
  await expect(normal).toBeChecked();

  // On Settings, down from Back comes round to the first slider; left turns it, and down moves on to the next.
  await button("Settings").click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  const [master, music] = ["Master volume", "Music volume"].map((name) => settings.getByRole("slider", { name }));
  await page.keyboard.press("ArrowDown");
  await expect(master).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(master).toHaveValue("95");
  await page.keyboard.press("ArrowDown");
  await expect(music).toBeFocused();
  await expect(master).toHaveValue("95");
  await expect(music).toHaveValue("70");
  await page.keyboard.press("Escape");

  // In a race, they ride.
  await startRacing(page);
  await page.keyboard.down("ArrowUp");
  await play(page, 3);
  await page.keyboard.up("ArrowUp");
  expect(await hudSpeedKmh(page)).toBeGreaterThan(40);
});

for (const key of ["Enter", "Space"]) {
  test(`starts the race with ${key} on the difficulty under Start Race`, async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(difficultyChoices(page).getByRole("radio", { name: "Normal" })).toBeFocused();

    await page.keyboard.press(key);

    await expect(page.getByTestId("countdown")).toBeVisible();
  });
}

test("shows the seed and difficulty the page's address asks for on the pause menu, without changing the difficulty the player chose", async ({
  page,
}) => {
  // Two page loads and four seconds of racing, a frame at a time.
  test.slow();
  await difficultyChoices(page).getByText("Hard").click();
  await page.goto("/?seed=1234&difficulty=easy");
  await expect(difficultyChoices(page).getByRole("radio", { name: "Easy" })).toBeChecked();
  await startRacing(page);
  // The player's first attack saves their settings again.
  await page.keyboard.press("j");
  await play(page, 0.4);
  expect(await hasAttacked(page)).toBe(true);

  await page.keyboard.press("Escape");

  const paused = page.getByRole("dialog", { name: "Paused" });
  await expect(paused.getByTestId("race-difficulty")).toHaveText(/^Easy$/i);
  await expect(paused.getByTestId("race-seed")).toHaveText(/^Race seed 1234$/i);
  await expect(paused.getByTitle(/^Add \?seed=1234&difficulty=easy to the page's address/)).toBeVisible();
  await page.clock.resume();
  await page.goto("/");
  await expect(difficultyChoices(page).getByRole("radio", { name: "Hard" })).toBeChecked();
  expect(await savedDifficulty(page)).toBe("hard");
});

/** The difficulty the save data holds as the player's choice. */
function savedDifficulty(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("rev-and-wreck:v2") ?? "{}").settings?.difficulty);
}

test("races Normal for an address with a seed alone, as v1.0.0's were, whatever difficulty the player chose", async ({
  page,
}) => {
  await difficultyChoices(page).getByText("Hard").click();
  await expect(difficultyChoices(page).getByRole("radio", { name: "Hard" })).toBeChecked();

  await page.goto("/?seed=1234");
  await expect(difficultyChoices(page).getByRole("radio", { name: "Normal" })).toBeChecked();
  // An address without a seed keeps the player's choice.
  await page.goto("/");
  await expect(difficultyChoices(page).getByRole("radio", { name: "Hard" })).toBeChecked();
});

test("reads the difficulty in the page's address whatever its case, and with spaces around it", async ({ page }) => {
  await page.goto("/?seed=1234&difficulty=%20Hard%20");

  await expect(difficultyChoices(page).getByRole("radio", { name: "Hard" })).toBeChecked();
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

/** Plays the race on a frame at a time until `happened` says so, for at most `seconds`; says whether it did. */
async function playUntil(page: Page, seconds: number, happened: () => Promise<boolean>) {
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let frame = 0; frame < frames && !(await happened()); frame++) await page.clock.fastForward(FRAME_MS);
  return happened();
}

/**
 * A race in which an opponent rides up beside a player who just holds the
 * throttle from the start and hits them in the first ten seconds, and nobody
 * hits them again for a while. Any seed will do in which that is so.
 */
const HIT_EARLY = "/?seed=9";

/** A race that a rider who just holds the throttle wrecks in the first half-minute. Any seed will do in which that is so. */
const WRECKED_EARLY = "/?seed=17";

/**
 * A race in which a rider who just holds the throttle from the start crashes,
 * and reaches their bike in the first twenty seconds as a car comes by that
 * would run into them if they got on. Any seed will do in which that is so.
 */
const CAR_COMING_EARLY = "/?seed=223";

/**
 * Rides the race at `WRECKED_EARLY`, with `query` added to its address,
 * holding the throttle until the results show, then lets go; returns the
 * results.
 */
async function wreckedEarly(page: Page, query = "") {
  await page.goto(WRECKED_EARLY + query);
  await startRacing(page);
  await page.keyboard.down("w");
  const results = page.getByRole("dialog", { name: "Wrecked" });
  expect(await playUntil(page, 60, () => results.isVisible())).toBe(true);
  await page.keyboard.up("w");
  return results;
}

/** Whether the save data says the player has ever attacked in a race, as a punch or kick thrown in one does. */
function hasAttacked(page: Page) {
  return page.evaluate(() => Object.values(localStorage).some((saved) => /"hasAttacked":true/.test(String(saved))));
}

async function staminaNow(page: Page) {
  return Number(await page.getByRole("meter", { name: "Stamina", exact: true }).getAttribute("aria-valuenow"));
}

test("prompts a player who has never attacked to hit back when an opponent's hit lands, for a few seconds", async ({
  page,
}) => {
  // Ten seconds and more of racing, a frame at a time.
  test.slow();
  await page.goto(HIT_EARLY);
  await startRacing(page);
  const prompt = page.getByTestId("hit-back-prompt");
  await expect(prompt).toBeHidden();
  await page.keyboard.down("w");

  expect(await playUntil(page, 15, () => prompt.isVisible())).toBe(true);
  expect(await staminaNow(page)).toBeLessThan(100);
  // It names the keys as the title and Controls screens do.
  await expect(prompt).toContainText("Hit back!");
  await expect(prompt.getByTestId("hit-back-keys").locator("kbd")).toHaveText(["J", "Z", "K", "X"]);
  await expect(prompt.getByTestId("hit-back-buttons")).toBeHidden();

  await play(page, 4.4);
  await page.keyboard.up("w");
  await expect(prompt).toBeHidden();
});

test("stops prompting the player to hit back as soon as they attack, and for good", async ({ page }) => {
  // Ten seconds and more of racing, a frame at a time.
  test.slow();
  await page.goto(HIT_EARLY);
  await startRacing(page);
  const prompt = page.getByTestId("hit-back-prompt");
  await page.keyboard.down("w");
  expect(await playUntil(page, 15, () => prompt.isVisible())).toBe(true);

  await page.keyboard.press("j");
  await play(page, 0.2);
  await expect(prompt).toBeHidden();
  await page.keyboard.up("w");

  // The same race again after a reload: the same hit lands, and this time nothing prompts the player.
  await page.clock.resume();
  await page.reload();
  await stopTheClockOnTheTitle(page, new Date(RACE_STARTS.getTime() + 60 * 60 * 1000));
  await page.getByRole("button", { name: "Start Race" }).click();
  await play(page, 3.6);
  await page.keyboard.down("w");
  expect(await playUntil(page, 15, async () => (await staminaNow(page)) < 100)).toBe(true);
  await page.keyboard.up("w");
  await expect(prompt).toBeHidden();
});

test("says a car is coming while the player waits by their bike for it to go by, in place of their status", async ({ page }) => {
  // Twenty seconds of racing, a frame at a time.
  test.slow();
  await page.goto(CAR_COMING_EARLY);
  await startRacing(page);
  const note = page.getByTestId("car-coming");
  await expect(note).toBeHidden();
  await page.keyboard.down("w");

  expect(await playUntil(page, 25, () => note.isVisible())).toBe(true);
  await expect(note).toHaveRole("status");
  await expect(note).toHaveText("Car coming!");
  await expect(page.getByTestId("rider-status")).toBeEmpty();

  expect(await playUntil(page, 3, async () => !(await note.isVisible()))).toBe(true);
  await page.keyboard.up("w");
});

test("goes back to the title from the results with Esc once they can be pressed, though not for an Esc held from the race", async ({
  page,
}) => {
  // Half a minute of racing, a frame at a time.
  test.slow();
  const results = await wreckedEarly(page);

  // Esc pressed as the race ends, to pause it say, leaves the results up...
  await page.keyboard.press("Escape");
  await play(page, 0.2);
  await expect(results).toBeVisible();
  // ...and so does one pressed then and held, the keyboard repeating it, after Restart has taken the focus.
  await page.keyboard.down("Escape");
  for (let frame = 0; frame < 10; frame++) {
    await page.clock.fastForward(FRAME_MS);
    await page.keyboard.down("Escape");
  }
  await expect(results.getByRole("button", { name: "Restart" })).toBeFocused();
  await expect(results).toBeVisible();
  await page.keyboard.up("Escape");

  // A fresh press goes back to the title, wherever the focus is: here, off the buttons after a click on the standings.
  await results.getByTestId("standings").click();
  await page.keyboard.press("Escape");
  await expect(results).toBeHidden();
  await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
});

test("shows the difficulty beside the seed on the results, with the personal best on that difficulty", async ({ page }) => {
  // Half a minute of racing, a frame at a time.
  test.slow();
  const best = (time: number, position: number) => ({ time, position });
  await page.evaluate(
    (saved) => localStorage.setItem("rev-and-wreck:v2", JSON.stringify(saved)),
    { personalBests: { easy: best(200.5, 1), normal: best(185.25, 4), hard: best(190.75, 6) } },
  );
  const results = await wreckedEarly(page, "&difficulty=hard");

  await expect(results.getByTestId("race-difficulty")).toHaveText(/^Hard$/i);
  await expect(results.getByTestId("race-seed")).toHaveText(/^Race seed 17$/i);
  await expect(results.getByText("Best on Hard")).toBeVisible();
  await expect(results.getByTestId("personal-best")).toHaveText("3:10.75");
  await expect(results.getByTestId("best-position")).toHaveText("6th");

  // The title screen shows it too.
  await play(page, 1.6);
  await results.getByRole("button", { name: "Back to title" }).click();
  await expect(page.getByTestId("title-personal-best")).toHaveText(/^Personal best on Hard 3:10\.75 · Best position 6th$/);
});

/**
 * Waits for the page's next animation frames, by when the game has read the
 * gamepad again, and React has drawn what the last frame changed: the game
 * reads the gamepad once a frame, so a button let go of and pressed again
 * between two frames would look held all along.
 */
function nextFrames(page: Page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

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
    // About ten seconds of racing, a frame at a time.
    test.slow();
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
    // About ten seconds of racing, a frame at a time.
    test.slow();
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

  /** Presses a gamepad button, waits for what it does, then lets go, and waits for the game to have seen it let go. */
  async function tap(page: Page, button: number, then: () => Promise<void>) {
    await gamepad(page).press(button);
    await then();
    await gamepad(page).release(button);
    await nextFrames(page);
  }

  test("names the gamepad's buttons when prompting a player who rides with one to hit back", async ({ page }) => {
    // Ten seconds and more of racing, a frame at a time.
    test.slow();
    await page.goto(HIT_EARLY);
    await startRacing(page);
    await gamepad(page).press(GAMEPAD.rightTrigger);

    const prompt = page.getByTestId("hit-back-prompt");
    expect(await playUntil(page, 15, () => prompt.isVisible())).toBe(true);
    await expect(prompt.getByTestId("hit-back-buttons").locator("kbd")).toHaveText(["X", "B"]);
    await expect(prompt.getByTestId("hit-back-keys")).toBeHidden();
    await gamepad(page).release(GAMEPAD.rightTrigger);
  });

  test("leaves the results up for a stick push, A and B as they open, then gives Restart the focus and B goes back", async ({
    page,
  }) => {
    // Half a minute of racing, a frame at a time.
    test.slow();
    const results = await wreckedEarly(page);

    // Still steering, throttling and kicking as the race ends: the stick's push would move the focus to a button,
    // A press it and B go back to the title.
    await gamepad(page).push(-0.7, 0.7);
    await page.clock.fastForward(FRAME_MS);
    await gamepad(page).push(0, 0);
    await page.clock.fastForward(FRAME_MS);
    for (const button of [GAMEPAD.a, GAMEPAD.b]) {
      await gamepad(page).press(button);
      await page.clock.fastForward(FRAME_MS);
      await gamepad(page).release(button);
      await page.clock.fastForward(FRAME_MS);
    }
    await expect(results).toBeVisible();

    await play(page, 1);
    await expect(results.getByRole("button", { name: "Restart" })).toBeFocused();
    await gamepad(page).press(GAMEPAD.b);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.b);
    await expect(results).toBeHidden();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  });

  test("moves between menu buttons with the D-pad or the left stick, and presses them with A", async ({ page }) => {
    // Eight presses and pushes, each waiting for the frames that read it.
    test.slow();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();

    // The difficulty under Start Race comes first.
    await tap(page, GAMEPAD.down, () => expect(difficultyChoices(page).getByRole("radio", { name: "Normal" })).toBeFocused());
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

  test("goes back with B from the screens the title screen opens, as Esc does", async ({ page }) => {
    // Three screens, and a few frames each, drawn over the scene.
    test.slow();
    for (const name of ["Controls", "Settings", "Credits"]) {
      await page.getByRole("button", { name, exact: true }).click();
      const screen = page.getByRole("dialog", { name });
      await expect(screen).toBeVisible();

      await tap(page, GAMEPAD.b, () => expect(screen).toBeHidden());
      await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
    }
  });

  test("goes back to the race from the pause menu with B, which kicks only in the race", async ({ page }) => {
    await startRacing(page);
    await gamepad(page).press(GAMEPAD.start);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.start);
    const menu = page.getByRole("dialog", { name: "Paused" });
    await expect(menu).toBeVisible();

    await gamepad(page).press(GAMEPAD.b);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.b);
    await expect(menu).toBeHidden();
    await play(page, 0.4);
    // The press that went back to the race didn't kick in it...
    expect(await hasAttacked(page)).toBe(false);

    // ...but a press in the race does.
    await gamepad(page).press(GAMEPAD.b);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.b);
    await play(page, 0.2);
    expect(await hasAttacked(page)).toBe(true);
    await expect(menu).toBeHidden();
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
    await tap(page, GAMEPAD.down, () => expect(difficultyChoices(page).getByRole("radio", { name: "Normal" })).toBeFocused());
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

    // Down from Start Race is the difficulty under it.
    const difficulty = difficultyChoices(page).getByRole("radio", { name: "Normal" });
    await gamepad(page).push(0, 0.7);
    await expect(difficulty).toBeFocused();
    for (const y of [0.5, 0.7, 0.5, 0.7]) {
      await gamepad(page).push(0, y);
      await nextFrames(page);
    }

    await expect(difficulty).toBeFocused();
    await gamepad(page).push(0, 0);
  });

  test("moves through a menu one way at a time, for a stick pushed or a D-pad pressed between two ways", async ({ page }) => {
    // A few pushes and presses, each waiting for the frames that read it.
    test.slow();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();
    const normal = difficultyChoices(page).getByRole("radio", { name: "Normal" });

    // Down and right as far: down, onto the difficulty under Start Race, without moving it along.
    await gamepad(page).push(0.72, 0.72);
    await nextFrames(page);
    await expect(normal).toBeFocused();
    await expect(normal).toBeChecked();
    await gamepad(page).push(0, 0);
    await nextFrames(page);

    await tap(page, GAMEPAD.up, () => expect(page.getByRole("button", { name: "Start Race" })).toBeFocused());
    await page.evaluate((buttons) => buttons.forEach((button) => window.fakeGamepad?.press(button)), [GAMEPAD.down, GAMEPAD.right]);
    await nextFrames(page);
    await expect(normal).toBeFocused();
    await expect(normal).toBeChecked();
    await page.evaluate((buttons) => buttons.forEach((button) => window.fakeGamepad?.release(button)), [GAMEPAD.down, GAMEPAD.right]);
    await nextFrames(page);

    // The D-pad's down switch closing a frame before its right one, as they can: still down alone.
    await tap(page, GAMEPAD.up, () => expect(page.getByRole("button", { name: "Start Race" })).toBeFocused());
    await page.evaluate(
      async ([down, right]) => {
        window.fakeGamepad?.press(down);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        window.fakeGamepad?.press(right);
      },
      [GAMEPAD.down, GAMEPAD.right],
    );
    await nextFrames(page);
    await expect(normal).toBeFocused();
    await expect(normal).toBeChecked();
  });

  test("moves the difficulty under Start Race with the D-pad's left and right, and A on it starts a race shown at it", async ({
    page,
  }) => {
    // Nine presses, each waiting for the frames that read it, then a race's first frames.
    test.slow();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();
    const choice = (name: string) => difficultyChoices(page).getByRole("radio", { name });

    await tap(page, GAMEPAD.down, () => expect(choice("Normal")).toBeFocused());
    await tap(page, GAMEPAD.right, () => expect(choice("Hard")).toBeChecked());
    // It stops at the ends, as a slider does.
    await tap(page, GAMEPAD.right, () => expect(choice("Hard")).toBeChecked());
    await tap(page, GAMEPAD.left, () => expect(choice("Normal")).toBeChecked());
    await tap(page, GAMEPAD.left, () => expect(choice("Easy")).toBeChecked());
    await expect(choice("Easy")).toBeFocused();

    // The difficulty is one stop between the buttons, whichever is chosen; A on it starts the race.
    await tap(page, GAMEPAD.down, () => expect(page.getByRole("button", { name: "Controls" })).toBeFocused());
    await tap(page, GAMEPAD.up, () => expect(choice("Easy")).toBeFocused());
    await tap(page, GAMEPAD.a, () => expect(page.getByTestId("countdown")).toBeVisible());
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Paused" }).getByTestId("race-difficulty")).toHaveText(/^Easy$/i);
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

test("goes back to the title from the screens it opens with Esc, wherever the focus is", async ({ page }) => {
  // Three screens, and a few frames each, drawn over the scene.
  test.slow();
  for (const name of ["Controls", "Settings", "Credits"]) {
    await page.getByRole("button", { name, exact: true }).click();
    const screen = page.getByRole("dialog", { name });
    // A click on the screen's title takes the focus off its buttons.
    await screen.getByRole("heading", { name }).click();

    await page.keyboard.press("Escape");
    await expect(screen).toBeHidden();
    await expect(page.getByRole("button", { name: "Start Race" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await pressEscOnCapsLock(page);
  await expect(settings).toBeHidden();
});

/**
 * Presses an Esc that the keyboard's layout puts on another key, here Caps Lock made an extra Esc: the browser says
 * which key it is, Escape, but not where it is.
 */
async function pressEscOnCapsLock(page: Page) {
  const browser = await page.context().newCDPSession(page);
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "CapsLock", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "CapsLock", windowsVirtualKeyCode: 27 });
  await browser.detach();
}

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
  // Seven rows of role queries, over the scene drawn behind them: a busy machine takes a while.
  test.slow();
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
    ["Back, in menus", ["Esc"], ["B"]],
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
    // Nothing says the sound is locked, past the moment a locked one would be told of. (Jumping there, rather than
    // running every frame on the way, is quicker where frames are slow to draw.)
    await page.clock.fastForward(1_200);
    await nextFrames(page);
    await expect(page.getByTestId("sound-locked")).toBeHidden();
  });

  /** Presses A on Start Race, which has the focus: a race started without a key press or click. The clock stops from then on. */
  async function startRaceWithTheGamepad(page: Page) {
    await expect(page.getByRole("button", { name: "Start Race" })).toBeFocused();
    await page.clock.pauseAt(RACE_STARTS);
    await gamepad(page).press(GAMEPAD.a);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.a);
  }

  test("says that a key press or click turns the sound on, where the browser keeps it locked after a gamepad starts the race", async ({
    page,
  }) => {
    await page.addInitScript(plugInAGamepad);
    await page.addInitScript(activatedOnlyByKeysAndClicks);
    await page.addInitScript(lockSoundUntilAKeyOrClick);
    await page.reload();

    await startRaceWithTheGamepad(page);
    const notice = page.getByTestId("sound-locked");
    await play(page, 1.2);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText("Press a key or click to turn the sound on");
    expect(await audioStates(page)).toEqual(["suspended"]);

    await page.keyboard.press("w");

    await expect.poll(() => audioStates(page)).toEqual(["running"]);
    await expect(notice).toBeHidden();
    await expect.poll(() => loudness(page), { timeout: 10_000 }).toBeGreaterThan(0.01);
  });

  test("says that a key press or click turns the sound on after a gamepad starts the race just after a click, where the browser starts it only from one", async ({
    page,
  }) => {
    await page.addInitScript(plugInAGamepad);
    await page.addInitScript(activatedOnlyByKeysAndClicks);
    await page.addInitScript(soundStartsOnlyInAKeyPressOrClick);
    await page.reload();
    await stopTheClockOnTheTitle(page);

    // The click gives the page the player's activation for a few seconds, but the browser starts no sound for the
    // gamepad's A that then starts the race from the difficulty.
    await difficultyChoices(page).getByText("Easy").click();
    await gamepad(page).press(GAMEPAD.a);
    await play(page, 0.2);
    await gamepad(page).release(GAMEPAD.a);
    const notice = page.getByTestId("sound-locked");
    await play(page, 1.2);
    await expect(notice).toBeVisible();
    expect(await audioStates(page)).toEqual(["suspended"]);

    await page.keyboard.press("w");

    await expect.poll(() => audioStates(page)).toEqual(["running"]);
    await expect(notice).toBeHidden();
  });

  /** Browsers that do and don't say whether the page has the player's activation, as the scripts that make them. */
  const ACTIVATION = [
    ["", activatedOnlyByKeysAndClicks],
    [" in a browser that can't say whether the page has the player's activation", withoutUserActivation],
  ] as const;

  for (const [browser, activation] of ACTIVATION) {
    test(`says nothing of a locked sound after a race started by a click, even where the browser never plays it${browser}`, async ({
      page,
    }) => {
      await page.addInitScript(activation);
      await page.addInitScript(neverPlayAudio);
      await page.reload();

      await page.getByRole("button", { name: "Start Race" }).click();
      await page.clock.fastForward(1_200);
      await nextFrames(page);

      expect(await audioStates(page)).toEqual(["suspended"]);
      await expect(page.getByTestId("countdown")).toBeVisible();
      await expect(page.getByTestId("sound-locked")).toBeHidden();
    });

    test(`keeps saying that a key press or click turns the sound on after Esc or Shift, which can't${browser}`, async ({
      page,
    }) => {
      await page.addInitScript(plugInAGamepad);
      await page.addInitScript(activation);
      await page.addInitScript(lockSoundUntilAKeyOrClick);
      await page.reload();
      await startRaceWithTheGamepad(page);
      const notice = page.getByTestId("sound-locked");
      await play(page, 1.2);
      await expect(notice).toBeVisible();

      // Esc pauses the race and resumes it, and Shift does nothing, but neither gives the page the player's activation.
      for (const key of ["Escape", "Escape", "Shift"]) {
        await page.keyboard.press(key);
        await play(page, 0.2);
      }
      await play(page, 1.2);

      await expect(notice).toBeVisible();
      expect(await audioStates(page)).toEqual(["suspended"]);
      await page.keyboard.press("w");
      await expect.poll(() => audioStates(page)).toEqual(["running"]);
      await expect(notice).toBeHidden();
    });
  }

  test("stops saying that a key press or click turns the sound on once one hasn't", async ({ page }) => {
    await page.addInitScript(plugInAGamepad);
    await page.addInitScript(activatedOnlyByKeysAndClicks);
    await page.addInitScript(neverPlayAudio);
    await page.reload();
    await startRaceWithTheGamepad(page);
    const notice = page.getByTestId("sound-locked");
    await play(page, 1.2);
    await expect(notice).toBeVisible();

    await page.keyboard.press("w");
    await play(page, 1.2);

    expect(await audioStates(page)).toEqual(["suspended"]);
    await expect(notice).toBeHidden();
    await play(page, 2);
    await expect(notice).toBeHidden();
  });

  test("keeps saying that a key press or click turns the sound on through races started with the gamepad alone", async ({
    page,
  }) => {
    // A race's first second, then a dozen presses, each played on for its frames to read it, and another first second.
    test.slow();
    await page.addInitScript(plugInAGamepad);
    await page.addInitScript(activatedOnlyByKeysAndClicks);
    await page.addInitScript(lockSoundUntilAKeyOrClick);
    await page.reload();
    await startRaceWithTheGamepad(page);
    const notice = page.getByTestId("sound-locked");
    await play(page, 1.2);
    await expect(notice).toBeVisible();
    /** Presses a gamepad button and lets go of it, playing the race on while the game reads both. */
    const press = async (button: number) => {
      await gamepad(page).press(button);
      await play(page, 0.2);
      await gamepad(page).release(button);
      await play(page, 0.2);
    };

    // Start pauses; down twice is Quit to title; down from Start Race is the difficulty, where A starts a race.
    for (const button of [GAMEPAD.start, GAMEPAD.down, GAMEPAD.down, GAMEPAD.a, GAMEPAD.down, GAMEPAD.a]) await press(button);
    await expect(page.getByTestId("countdown")).toBeVisible();
    await play(page, 1.2);

    expect(await audioStates(page)).toEqual(["suspended"]);
    await expect(notice).toBeVisible();
  });

  for (const [silenced, volumes] of [
    ["the master volume", { masterVolume: 0 }],
    ["the music and the effects", { musicVolume: 0, effectsVolume: 0 }],
  ] as const) {
    test(`says nothing of a locked sound to a player who has turned ${silenced} all the way down`, async ({ page }) => {
      await page.evaluate((settings) => localStorage.setItem("rev-and-wreck:v2", JSON.stringify({ settings })), volumes);
      await page.addInitScript(plugInAGamepad);
      await page.addInitScript(activatedOnlyByKeysAndClicks);
      await page.addInitScript(lockSoundUntilAKeyOrClick);
      await page.reload();

      await startRaceWithTheGamepad(page);
      await play(page, 1.2);

      expect(await audioStates(page)).toEqual(["suspended"]);
      await expect(page.getByTestId("countdown")).toBeVisible();
      await expect(page.getByTestId("sound-locked")).toBeHidden();
    });
  }
});

/**
 * Runs in the page before its scripts: a browser in which only a key press or click gives the page the player's
 * activation, for the few seconds after it, as in Safari, where a gamepad's press doesn't; and, as the HTML standard
 * and Chromium have it, not Esc, nor a modifier key pressed alone. (Playwright's own calls into the page give it too,
 * which a gamepad's press never would.)
 */
function activatedOnlyByKeysAndClicks() {
  const activates = (event: Event) =>
    event.isTrusted && !(event instanceof KeyboardEvent && ["Escape", "Shift", "Control", "Alt", "Meta"].includes(event.key));
  let last = -Infinity;
  for (const gesture of ["keydown", "mousedown"]) {
    window.addEventListener(gesture, (event) => activates(event) && (last = performance.now()), { capture: true });
  }
  Object.defineProperty(Navigator.prototype, "userActivation", {
    configurable: true,
    get: () => ({ isActive: performance.now() - last < 5_000, hasBeenActive: last > -Infinity }),
  });
}

/**
 * Runs in the page before its scripts: a browser that can't say whether the page has the player's activation, as
 * Safari before 16.4 and Firefox before 120 can't.
 */
function withoutUserActivation() {
  Reflect.deleteProperty(Navigator.prototype, "userActivation");
}

/**
 * Runs in the page before its scripts: a browser that keeps sound locked until the page's first key press or click,
 * as Firefox before 155 does: until then, an audio context made or resumed stays suspended. A gamepad's press is not
 * one, nor, as for the player's activation (see `activatedOnlyByKeysAndClicks`), is Esc or a modifier key alone.
 */
function lockSoundUntilAKeyOrClick() {
  const activates = (event: Event) =>
    event.isTrusted && !(event instanceof KeyboardEvent && ["Escape", "Shift", "Control", "Alt", "Meta"].includes(event.key));
  let unlocked = false;
  for (const gesture of ["keydown", "mousedown"]) {
    window.addEventListener(gesture, (event) => (unlocked ||= activates(event)), { capture: true });
  }
  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    constructor(options?: AudioContextOptions) {
      super(options);
      if (!unlocked) void super.suspend();
    }
    resume() {
      return unlocked ? super.resume() : new Promise<void>(() => {});
    }
  };
}

/**
 * Runs in the page before its scripts: a browser that starts an audio context only while it handles a key press or
 * click, any key (Esc too), though the page keeps the player's activation for a few seconds after one, as Safari does.
 * A context that has started once may play from then on.
 */
function soundStartsOnlyInAKeyPressOrClick() {
  let handling = false;
  for (const gesture of ["keydown", "keyup", "mousedown", "mouseup", "click"]) {
    // The window hears a press first, as it is captured, and last, as it bubbles up after React has handled it.
    window.addEventListener(gesture, (event) => (handling = event.isTrusted), { capture: true });
    window.addEventListener(gesture, () => (handling = false));
  }
  const started = new WeakSet<AudioContext>();
  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    constructor(options?: AudioContextOptions) {
      super(options);
      if (handling) started.add(this);
      else void super.suspend();
    }
    resume() {
      if (handling) started.add(this);
      return started.has(this) ? super.resume() : new Promise<void>(() => {});
    }
  };
}

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
