import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditDist } from "../../scripts/audit-site-quality.mjs";

const pngHeader = () => {
  const buffer = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(1200, 16);
  buffer.writeUInt32BE(630, 20);
  return buffer;
};

const html = (title: string, image = '<img src="/brand/mark.svg" alt="" />') => `<!doctype html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="description" content="Open opportunities" />
    <link rel="canonical" href="https://next.example/${encodeURIComponent(title)}/" />
    <link rel="icon" href="/favicon.svg" />
    <meta property="og:image" content="https://next.example/brand/social-card.png" />
    <script type="application/ld+json">{"@context":"https://schema.org"}</script>
  </head>
  <body><main><h1>${title}</h1>${image}<p>Open opportunities.</p></main></body>
</html>`;

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "perkcommons-quality-extra-"));
  await mkdir(join(root, "brand"), { recursive: true });
  await writeFile(join(root, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://next.example/sitemap.xml\n", "utf8");
  await writeFile(join(root, "sitemap.xml"), "<urlset></urlset>", "utf8");
  await writeFile(join(root, "llms.txt"), "PerkCommons Next", "utf8");
  await writeFile(join(root, "favicon.svg"), "<svg></svg>", "utf8");
  await writeFile(join(root, "brand", "social-card.png"), pngHeader());
  return root;
};

test("site-quality audit rejects duplicate page titles across generated routes", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "about"), { recursive: true });
    await writeFile(join(root, "index.html"), html("Same title"), "utf8");
    await writeFile(join(root, "about", "index.html"), html("Same title"), "utf8");

    const { errors } = await auditDist(root, { maxLargestJsBytes: 150_000 });
    assert.ok(errors.some((error: string) => /duplicate page title/i.test(error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("site-quality audit rejects img elements without an alt attribute", async () => {
  const root = await fixture();
  try {
    await writeFile(
      join(root, "index.html"),
      html("Accessible title", '<img src="/brand/mark.svg" />'),
      "utf8",
    );

    const { errors } = await auditDist(root, { maxLargestJsBytes: 150_000 });
    assert.ok(errors.some((error: string) => /img.*alt/i.test(error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
