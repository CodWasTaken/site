import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("data-quality page is generated from the checked-in data report", async () => {
  const source = await readFile(
    new URL("../../src/pages/data-quality.astro", import.meta.url),
    "utf8",
  ).catch(() => null);

  assert.ok(source, "src/pages/data-quality.astro must exist");
  assert.match(source, /reports\/data-quality\.json/);
  assert.match(source, /humanReviewProvenance/);
  assert.match(source, /requiresManualSourceReview/);
  assert.match(source, /incompleteGeography/);
  assert.match(source, /applicationUrls/);
  assert.match(source, /structuredDeadlines/);
  assert.match(source, /duplicateUrlRecords/);
  assert.match(source, /brokenLinkRate/);
  assert.match(source, /redirectRate/);
  assert.match(source, /Not measured/);
  assert.match(source, /statusCounts/);
});

test("data-quality page does not hard-code the current catalogue size", async () => {
  const source = await readFile(
    new URL("../../src/pages/data-quality.astro", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, />\s*1068\s*</);
});
