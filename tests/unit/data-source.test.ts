import assert from "node:assert/strict";
import test from "node:test";
import { resolveDataSource } from "../../scripts/data-source.mjs";

test("Vercel defaults to the CodWasTaken data repository", () => {
  const source = resolveDataSource({ VERCEL: "1" });
  assert.equal(source.repository, "https://github.com/CodWasTaken/data.git");
  assert.equal(source.ref, "main");
});

test("Vercel rejects an explicit attempt to use the original data repository", () => {
  assert.throws(
    () =>
      resolveDataSource({
        VERCEL: "1",
        PERKCOMMONS_DATA_REPOSITORY:
          "https://github.com/PerkCommons/data.git",
        PERKCOMMONS_DATA_REF: "main",
      }),
    /restricted to CodWasTaken\/data/i,
  );
});

test("Vercel allows an exact commit pin inside the approved data repository", () => {
  const sha = "db80383717ded0e29af497d36894c52bde8a01fa";
  const source = resolveDataSource({
    VERCEL: "1",
    PERKCOMMONS_DATA_REPOSITORY:
      "https://github.com/CodWasTaken/data.git",
    PERKCOMMONS_DATA_REF: sha,
  });
  assert.equal(source.repository, "https://github.com/CodWasTaken/data.git");
  assert.equal(source.ref, sha);
});
