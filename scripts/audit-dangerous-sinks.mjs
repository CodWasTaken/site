import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_ROOTS = ["src", "worker"];
const SOURCE_EXTENSIONS = new Set([".ts", ".astro", ".js"]);

const SINKS = [
  { name: "innerHTML", expression: /\binnerHTML\b/ },
  { name: "outerHTML", expression: /\bouterHTML\b/ },
  { name: "insertAdjacentHTML", expression: /\binsertAdjacentHTML\b/ },
  { name: "eval(", expression: /\beval\s*\(/ },
  { name: "new Function", expression: /\bnew\s+Function\b/ },
  { name: "set:html", expression: /\bset:html\s*=/ },
];

const ALLOWLIST = [
  {
    path: "src/layouts/BaseLayout.astro",
    sink: "set:html",
    substring: "set:html={safeJsonLd(structuredData)}",
  },
];

const walkSourceFiles = async (root) => {
  const files = [];
  const visit = async (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
    }
  };
  for (const sourceRoot of SOURCE_ROOTS) await visit(join(root, sourceRoot));
  return files;
};

const normalizedRelativePath = (root, path) => relative(root, path).replaceAll("\\", "/");

const isAllowed = (path, sink, line) =>
  ALLOWLIST.some(
    (entry) => entry.path === path && entry.sink === sink && line.includes(entry.substring),
  );

export const auditDangerousSinks = async (root = process.cwd()) => {
  const repoRoot = resolve(root);
  const errors = [];
  const files = await walkSourceFiles(repoRoot);

  for (const file of files) {
    const sourcePath = normalizedRelativePath(repoRoot, file);
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const sink of SINKS) {
        if (!sink.expression.test(line) || isAllowed(sourcePath, sink.name, line)) continue;
        errors.push(`${sourcePath}:${index + 1}: forbidden ${sink.name} sink`);
      }
    }
  }

  return { errors: errors.sort() };
};

const main = async () => {
  const { errors } = await auditDangerousSinks(process.argv[2] ?? process.cwd());
  if (!errors.length) {
    console.log("dangerous-sinks: no unreviewed dynamic HTML or eval sinks found");
    return;
  }
  for (const error of errors) console.error(`dangerous-sinks: ${error}`);
  process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
