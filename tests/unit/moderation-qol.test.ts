import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isDefaultOpportunity, statusLabel } from "../../src/lib/listings";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("published moderation review workspace exposes oldest-review workflow and canonical actions", async () => {
  const [page, script, controller] = await Promise.all([
    read("../../src/pages/moderate.astro"),
    read("../../src/scripts/moderation.ts"),
    read("../../src/scripts/moderation/published-review.ts"),
  ]);
  assert.match(page, /Published opportunity review/);
  assert.match(page, /Oldest human verification comes first/);
  assert.match(page, /Verify current/);
  assert.match(page, /Mark inactive/);
  assert.match(page, /Remove published listing/);
  assert.match(script, /\/verify/);
  assert.match(script, /\/inactive/);
  assert.match(script, /\/remove/);
  assert.match(controller, /Never human verified/);
  assert.match(controller, /Check program link/);
});

test("listing detail contains moderator-only deep links below the public listing", async () => {
  const [listing, layout] = await Promise.all([
    read("../../src/pages/opportunities/[id].astro"),
    read("../../src/layouts/BaseLayout.astro"),
  ]);
  assert.match(listing, /data-moderator-tools/);
  assert.match(listing, /action=edit/);
  assert.match(listing, /action=verify/);
  assert.match(listing, /action=inactive/);
  assert.match(listing, /action=remove/);
  assert.match(layout, /\[data-moderator-tools\]/);
  assert.match(layout, /authState\.moderator/);
});

test("archived canonical status is presented as Inactive and excluded from default discovery", () => {
  assert.equal(statusLabel("archived"), "Inactive");
  assert.equal(statusLabel("temporarily-unavailable"), "Temporarily Unavailable");
  assert.equal(isDefaultOpportunity({ defaultSearchEligible: false, status: "archived" }), false);
});
