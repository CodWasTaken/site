import { expect, test } from "@playwright/test";

test("public moderator probe does not expose moderator-only listing controls", async ({ page }) => {
  const listingId = "github-student-developer-pack";
  await page.route("**/api/listings/state**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        listings: [{ listing_id: listingId, featured: false, removed: false }],
      }),
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ moderator: null }),
    }),
  );

  await page.goto(`/opportunities/${listingId}/`);

  await expect(page.locator(`[data-feature-toggle="${listingId}"]`)).toBeHidden();
});
