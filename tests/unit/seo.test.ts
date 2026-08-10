import assert from "node:assert/strict";
import test from "node:test";

const loadSeo = async () => {
  const modulePath = "../../src/lib/seo.ts";
  return import(modulePath).catch(() => null);
};

test("SEO helper exists for environment-safe metadata", async () => {
  const seo = await loadSeo();
  assert.ok(seo, "src/lib/seo.ts must provide the shared SEO boundary");
});

test("canonicalUrl resolves against configured site origin", async () => {
  const seo = await loadSeo();
  assert.ok(seo);
  assert.equal(
    seo.canonicalUrl(new URL("https://next.example/"), "/about/").href,
    "https://next.example/about/",
  );
});

test("safeJsonLd cannot close its script element", async () => {
  const seo = await loadSeo();
  assert.ok(seo);
  const original = "</script><script>alert(1)</script>\u2028";
  const encoded = seo.safeJsonLd({ name: original });
  assert.equal(encoded.includes("</script>"), false);
  assert.equal(JSON.parse(encoded).name, original);
});

test("base structured data uses the configured origin", async () => {
  const seo = await loadSeo();
  assert.ok(seo);
  const json = JSON.stringify(seo.baseStructuredData(new URL("https://next.example/")));
  assert.match(json, /https:\/\/next\.example/);
  assert.doesNotMatch(json, /https:\/\/perkcommons\.com/);
});
