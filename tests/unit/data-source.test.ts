import assert from "node:assert/strict";
import test from "node:test";

test("Vercel defaults to the CodWasTaken data fork when build variables are absent", async () => {
  let resolveDataSource:
    | ((env: Record<string, string | undefined>) => {
        repository: string;
        ref: string | undefined;
      })
    | undefined;

  try {
    ({ resolveDataSource } = await import("../../scripts/data-source.mjs"));
  } catch {
    resolveDataSource = undefined;
  }

  assert.ok(resolveDataSource, "a runtime data-source resolver should exist");

  const source = resolveDataSource({ VERCEL: "1" });
  assert.equal(source.repository, "https://github.com/CodWasTaken/data.git");
  assert.equal(source.ref, "main");
});

test("Vercel rejects an explicit attempt to use the original data repository", async () => {
  let resolveDataSource:
    | ((env: Record<string, string | undefined>) => {
        repository: string;
        ref: string | undefined;
      })
    | undefined;

  try {
    ({ resolveDataSource } = await import("../../scripts/data-source.mjs"));
  } catch {
    resolveDataSource = undefined;
  }

  assert.ok(resolveDataSource, "a runtime data-source resolver should exist");

  assert.throws(
    () =>
      resolveDataSource({
        VERCEL: "1",
        PERKCOMMONS_DATA_REPOSITORY: "https://github.com/PerkCommons/data.git",
        PERKCOMMONS_DATA_REF: "main",
      }),
    /restricted to CodWasTaken\/data main/,
  );
});
