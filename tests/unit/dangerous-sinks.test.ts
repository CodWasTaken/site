import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const loadAudit = async () => {
  const modulePath = "../../scripts/audit-dangerous-sinks.mjs";
  return import(modulePath).catch(() => null);
};

const makeFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "perkcommons-sinks-"));
  await mkdir(join(root, "src", "layouts"), { recursive: true });
  await mkdir(join(root, "worker"), { recursive: true });
  await writeFile(join(root, "worker", "handler.ts"), "export const handler = () => true;\n", "utf8");
  return root;
};

test("dangerous-sink audit reports forbidden dynamic HTML with file and line", async () => {
  const audit = await loadAudit();
  assert.ok(audit, "scripts/audit-dangerous-sinks.mjs must exist");
  const root = await makeFixture();
  try {
    await writeFile(
      join(root, "src", "unsafe.ts"),
      "const node = document.createElement('div');\nnode.innerHTML = userContent;\n",
      "utf8",
    );
    const { errors } = await audit.auditDangerousSinks(root);
    assert.ok(errors.some((error: string) => /src\/unsafe\.ts:2.*innerHTML/i.test(error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dangerous-sink audit allows only the reviewed safe JSON-LD set:html call", async () => {
  const audit = await loadAudit();
  assert.ok(audit, "scripts/audit-dangerous-sinks.mjs must exist");
  const root = await makeFixture();
  try {
    await writeFile(
      join(root, "src", "layouts", "BaseLayout.astro"),
      '<script is:inline type="application/ld+json" set:html={safeJsonLd(structuredData)} />\n',
      "utf8",
    );
    await writeFile(
      join(root, "src", "Other.astro"),
      '<div set:html={userControlledHtml}></div>\n',
      "utf8",
    );
    const { errors } = await audit.auditDangerousSinks(root);
    assert.equal(errors.some((error: string) => /BaseLayout\.astro/.test(error)), false);
    assert.ok(errors.some((error: string) => /src\/Other\.astro:1.*set:html/i.test(error)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
