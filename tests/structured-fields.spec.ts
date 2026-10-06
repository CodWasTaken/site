import { expect, test } from "@playwright/test";

test("fixed application window exposes a deadline and calendar action", async ({ page }) => {
  await page.goto("/opportunities/cal-job-shadow/");
  await expect(page.getByText("Closes Oct 26, 2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add deadline to calendar" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Program details/ })).toHaveAttribute(
    "href",
    "https://www.career.berkeley.edu/find-opportunities/experiential-learning/externship-program/",
  );
});

test("rolling opportunity uses the direct application page without inventing a fixed date", async ({ page }) => {
  await page.goto("/opportunities/alchemist-accelerator/");
  await expect(page.getByText("Rolling applications", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Application page/ })).toHaveAttribute(
    "href",
    "https://www.alchemistaccelerator.com/apply",
  );
  await expect(page.getByRole("button", { name: "Add deadline to calendar" })).toHaveCount(0);
});

test("data-quality page publishes measured structured-field coverage", async ({ page }) => {
  await page.goto("/data-quality/");
  await expect(page.getByText("October 6, 2026", { exact: false })).toBeVisible();
  await expect(page.getByText("Structured deadlines", { exact: true })).toBeVisible();
  await expect(page.getByText("Application URLs", { exact: true })).toBeVisible();
});
