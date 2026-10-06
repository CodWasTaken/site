import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deadlineLabel } from "../../src/lib/listings";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("deadline labels distinguish fixed, rolling, periodic, none, and unresolved windows", () => {
  assert.equal(deadlineLabel({ deadlineType: "fixed", deadline: "2026-10-26" }), "Closes Oct 26, 2026");
  assert.equal(deadlineLabel({ deadlineType: "rolling", deadline: null }), "Rolling applications");
  assert.equal(deadlineLabel({ deadlineType: "periodic", deadline: null }), "Recurring application windows");
  assert.equal(deadlineLabel({ deadlineType: "none", deadline: null }), "No application deadline");
  assert.equal(deadlineLabel({ deadlineType: "unknown", deadline: null }), "Deadline not structured");
});

test("listing detail uses neutral application wording and exposes structured application windows", async () => {
  const page = await read("../../src/pages/opportunities/[id].astro");
  assert.match(page, /Application page/);
  assert.match(page, /Join waitlist/);
  assert.doesNotMatch(page, /Open application/);
  assert.match(page, /Application window/);
  assert.match(page, /deadlineLabel\(listing\)/);
  assert.match(page, /listing\.applicationCycle/);
  assert.match(page, /Add deadline to calendar/);
});

test("moderator review cards expose structured-field completeness", async () => {
  const [page, controller, route] = await Promise.all([
    read("../../src/pages/moderate.astro"),
    read("../../src/scripts/moderation/published-review.ts"),
    read("../../worker/routes/moderation.ts"),
  ]);
  assert.match(page, /Application cadence/);
  assert.match(page, /Direct application URL/);
  assert.match(controller, /Application page linked/);
  assert.match(controller, /Application page not structured/);
  assert.match(controller, /Deadline not structured/);
  assert.match(controller, /Cycle details not structured/);
  assert.match(route, /deadlineType: listing\.deadlineType/);
  assert.match(route, /applicationCycle: listing\.applicationCycle/);
  assert.match(route, /deadline: listing\.deadline/);
});
