import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const loadPostbuild = async () => {
  const modulePath = "../../scripts/postbuild-site-assets.mjs";
  return import(modulePath).catch(() => null);
};

test("postbuild crawler artifacts use the configured deployment origin", async () => {
  const postbuild = await loadPostbuild();
  assert.ok(postbuild, "scripts/postbuild-site-assets.mjs must exist");

  const root = await mkdtemp(join(tmpdir(), "perkcommons-site-assets-"));
  try {
    const sitemap = "<?xml version=\"1.0\"?><sitemapindex></sitemapindex>";
    await writeFile(join(root, "sitemap-index.xml"), sitemap, "utf8");
    await postbuild.postbuildSiteAssets(root, {
      PUBLIC_SITE_URL: "https://preview.example",
    });

    assert.equal(await readFile(join(root, "sitemap.xml"), "utf8"), sitemap);
    assert.equal(
      await readFile(join(root, "robots.txt"), "utf8"),
      "User-agent: *\nAllow: /\nSitemap: https://preview.example/sitemap.xml\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("postbuild crawler artifacts reject non-HTTPS public origins", async () => {
  const postbuild = await loadPostbuild();
  assert.ok(postbuild);
  const root = await mkdtemp(join(tmpdir(), "perkcommons-site-assets-"));
  try {
    await writeFile(join(root, "sitemap-index.xml"), "<sitemapindex/>", "utf8");
    await assert.rejects(
      postbuild.postbuildSiteAssets(root, { PUBLIC_SITE_URL: "http://preview.example" }),
      /HTTPS/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("custom 404 page exists and is explicitly noindex", async () => {
  const page = await readFile(resolve("src/pages/404.astro"), "utf8").catch(() => null);
  assert.ok(page, "src/pages/404.astro must exist");
  assert.match(page, /<BaseLayout[\s\S]*noindex/);
  assert.match(page, /<h1\b/);
  assert.match(page, /href="\/opportunities\/"/);
});

test("llms.txt identifies the experimental fork and public data entry points", async () => {
  const llms = await readFile(resolve("public/llms.txt"), "utf8").catch(() => null);
  assert.ok(llms, "public/llms.txt must exist");
  assert.match(llms, /experimental/i);
  assert.match(llms, /\/api\/v1\/opportunities/);
  assert.match(llms, /\/data\/opportunities\.json/);
  assert.match(llms, /CodWasTaken\/site/);
  assert.match(llms, /CodWasTaken\/data/);
});

test("social preview is a 1200x630 PNG", async () => {
  const image = await readFile(resolve("public/brand/social-card.png")).catch(() => null);
  assert.ok(image, "public/brand/social-card.png must exist");
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});
