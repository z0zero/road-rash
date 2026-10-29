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

test("draws the race on a canvas", async ({ page }) => {
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});
