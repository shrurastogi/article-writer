/**
 * E2E tests for the article editor.
 * Requires a running server at E2E_BASE_URL (default: http://localhost:3000).
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

test.describe("Editor", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to editor (new article or existing — adjust id as needed)
    await page.goto("/");
  });

  test("dark mode toggle switches theme and persists across reload", async ({ page }) => {
    const html = page.locator("html");
    // Start in light mode
    await expect(html).not.toHaveAttribute("data-theme", "dark");

    await page.click("#theme-toggle");
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Persist across reload
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");

    // Toggle back
    await page.click("#theme-toggle");
    await expect(html).not.toHaveAttribute("data-theme", "dark");
  });

  test("font zoom A+ increases font size and ↺ resets to default", async ({ page }) => {
    const body = page.locator("body");
    const defaultSize = "14px";

    // Reset to baseline
    await page.evaluate(() => localStorage.removeItem("font-size"));
    await page.reload();

    // A+ once
    await page.click(".btn-font-zoom >> text=A+");
    const newSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--base-font-size").trim()
    );
    expect(newSize).not.toBe(defaultSize);

    // Reset
    await page.click(".btn-font-zoom >> text=↺");
    const resetSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--base-font-size").trim()
    );
    expect(resetSize).toBe(defaultSize);
  });

  test("section textarea has spellcheck enabled", async ({ page }) => {
    // Open first section (Introduction)
    await page.click("#section-introduction .section-head");
    const textarea = page.locator("#content-introduction");
    await expect(textarea).toHaveAttribute("spellcheck", "true");
  });

  test("language selector persists after reload", async ({ page }) => {
    const sel = page.locator("#language-select");
    await sel.selectOption("Spanish");
    await expect(sel).toHaveValue("Spanish");

    // Trigger auto-save: set topic so save fires
    await page.fill("#medical-topic", "Test topic");
    await page.waitForTimeout(2500); // wait for auto-save debounce

    await page.reload();
    // After reload the language should be restored from server
    await expect(page.locator("#language-select")).toHaveValue("Spanish");
  });

  test("drag-drop handle is visible on section header", async ({ page }) => {
    const handle = page.locator("#section-introduction .drag-handle").first();
    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute("draggable", "true");
  });
});
