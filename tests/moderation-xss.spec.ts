import { expect, test, type Page } from "@playwright/test";

const submissionId = "11111111-1111-4111-8111-111111111111";
const imagePayload = "<img src=x onerror=window.__xss=1>";
const scriptPayload = "</script><script>window.__xss=1</script>";

const submission = {
  id: submissionId,
  name: "Open Infrastructure Grant",
  organization: "Example Foundation",
  categories: ["funding"],
  primary_category: "funding",
  subcategories: ["research-funding"],
  tags: ["open-source"],
  description: `Funding details ${imagePayload}`,
  eligibility: `Eligible applicants ${scriptPayload}`,
  benefits: "$10,000 in unrestricted project funding.",
  location: "Global",
  deadline: "2026-12-01",
  source_url: "https://example.org/grant",
  organization_website_url: "https://example.org",
  submitter_name: "Community Contributor",
  submitter_email: "contributor@example.org",
  submitter_notes: "No affiliation with the provider.",
  status: "pending",
  risk_score: 0,
  flag_count: 0,
  submission_country_code: "PL",
  created_at: new Date(Date.now() - 18 * 60_000).toISOString(),
  updated_at: new Date().toISOString(),
  reviewed_at: null,
  published_at: null,
  last_action_at: null,
  decision_reason: null,
};

async function mockModeration(page: Page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        moderator: { email: "moderator@perkcommons.org", role: "reviewer" },
      }),
    }),
  );
  await page.route("**/api/moderation/queue?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        queue: "pending",
        count: 1,
        submissions: [submission],
      }),
    }),
  );
  await page.route(`**/api/moderation/submissions/${submissionId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ normalized: null, flags: [], actions: [] }),
    }),
  );
  await page.route("**/api/moderation/reports", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, reports: [] }),
    }),
  );
}

test("moderation preview renders XSS-shaped submission fields as literal text", async ({ page }) => {
  await mockModeration(page);
  await page.goto("/moderate/");

  await expect(page.locator("#submission-description")).toContainText(imagePayload);
  await expect(page.locator("#submission-eligibility")).toContainText(scriptPayload);
  await expect(page.locator('#review-card img[src="x"]')).toHaveCount(0);
  await expect(page.locator("#review-card script")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __xss?: number }).__xss))
    .toBeUndefined();
});
