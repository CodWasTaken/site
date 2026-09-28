import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("listing detail renders provenance state instead of schema-version review claims", async () => {
  const source = await read("../../src/pages/opportunities/[id].astro");
  assert.doesNotMatch(source, /Reviewed manually on/);
  assert.match(source, /editorialReviewState/);
  assert.match(source, /listing\.verified/);
  assert.match(source, /Human editorial review is still pending/);
});

test("trust and about copy describe mixed review coverage without experimental-fork framing", async () => {
  const [trust, about] = await Promise.all([
    read("../../src/pages/trust.astro"),
    read("../../src/pages/about.astro"),
  ]);

  assert.doesNotMatch(trust, /Records are checked by hand by moderators/);
  assert.match(trust, /automated/i);
  assert.match(trust, /human review/i);
  assert.doesNotMatch(about, /Next experimental fork/i);
  assert.doesNotMatch(about, /not the production PerkCommons service/i);
});

test("canonical layout and llms index no longer brand the promoted version as an experiment", async () => {
  const [layout, llms] = await Promise.all([
    read("../../src/layouts/BaseLayout.astro"),
    read("../../public/llms.txt"),
  ]);

  assert.doesNotMatch(layout, /Next experiment/);
  assert.doesNotMatch(layout, /Experimental data/);
  assert.doesNotMatch(layout, /Fork source/);
  assert.doesNotMatch(llms, /experimental fork/i);
  assert.doesNotMatch(llms, /not the official production PerkCommons implementation/i);
});
