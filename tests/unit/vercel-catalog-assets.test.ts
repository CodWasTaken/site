import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogAssetsBinding } from "../../vercel/catalog-assets.js";

test("Vercel catalogue assets serve generated JSON without a network fetch", async () => {
  const assets = createCatalogAssetsBinding({
    "/data/opportunities.json": {
      metadata: { dataCommit: "abc123" },
      records: [{ id: "example" }],
    },
  });

  const response = await assets.fetch(
    new Request("https://preview.example/data/opportunities.json"),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), {
    metadata: { dataCommit: "abc123" },
    records: [{ id: "example" }],
  });
});

test("Vercel catalogue assets return 404 for unknown build artifacts", async () => {
  const assets = createCatalogAssetsBinding({});
  const response = await assets.fetch(
    new Request("https://preview.example/data/missing.json"),
  );
  assert.equal(response.status, 404);
});
