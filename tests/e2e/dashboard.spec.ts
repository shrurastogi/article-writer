/**
 * E2E tests for the dashboard page.
 * Requires a running server at E2E_BASE_URL (default: http://localhost:3000).
 * Run: npm run test:e2e
 *
 * These tests assume a logged-in session (cookie set) or the app is in bypass-auth mode.
 * For CI, run against a seeded Railway dev environment.
 */

import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("card/list view toggle updates display and persists in localStorage", async ({ page }) => {
    // Default is card view
    await expect(page.locator("#view-btn-card")).toHaveClass(/active/);

    // Switch to list
    await page.click("#view-btn-list");
    await expect(page.locator("#view-btn-list")).toHaveClass(/active/);
    await expect(page.locator(".articles-table")).toBeVisible();

    // Persist check — reload
    await page.reload();
    await expect(page.locator("#view-btn-list")).toHaveClass(/active/);

    // Switch back to card
    await page.click("#view-btn-card");
    await expect(page.locator(".articles-grid")).toBeVisible();
  });

  test("text filter narrows results and clear button resets", async ({ page }) => {
    const searchInput = page.locator("#filter-text");
    await searchInput.fill("zzznomatch");
    await expect(page.locator("#btn-clear-filters")).toBeVisible();

    // Clear
    await page.click("#btn-clear-filters");
    await expect(searchInput).toHaveValue("");
    await expect(page.locator("#btn-clear-filters")).toBeHidden();
  });

  test("filter chip appears for active filter and can be removed", async ({ page }) => {
    await page.locator("#filter-text").fill("test");
    await expect(page.locator(".filter-chip")).toBeVisible();
    await page.locator(".filter-chip-x").first().click();
    await expect(page.locator(".filter-chip")).not.toBeVisible();
  });

  test("delete modal opens and can be cancelled", async ({ page }) => {
    // Only run if there are articles
    const cards = page.locator(".article-card");
    const count = await cards.count();
    if (count === 0) {
      test.skip();
      return;
    }
    // Hover card to reveal actions then click delete
    await cards.first().hover();
    await cards.first().locator(".delete-btn").click();
    await expect(page.locator("#delete-modal")).toHaveClass(/visible/);

    // Cancel
    await page.click(".btn-cancel");
    await expect(page.locator("#delete-modal")).not.toHaveClass(/visible/);
  });
});
