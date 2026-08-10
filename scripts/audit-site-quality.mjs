import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(repoRoot, "docs/site-quality-baseline.json");

const walkFiles = async (root) => {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  if (existsSync(root)) await visit(root);
  return files;
};

const countMatches = (value, expression) => value.match(expression)?.length ?? 0;

const defaultJsBudget = async () => {
  try {
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    const measured = Number(baseline.largestJsBytes ?? 0);
    if (Number.isFinite(measured) && measured > 0) {
      return Math.max(150_000, Math.ceil(measured * 1.1));
    }
  } catch {}
  return 150_000;
};

const inspectHtml = (path, html, errors) => {
  const route = relative(process.cwd(), path).replaceAll("\\", "/");
  if (!/<html\b[^>]*\blang=(['"])[^'"]+\1/i.test(html)) {
    errors.push(`${route}: html lang attribute is missing or empty`);
  }

  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  const title = titles.length === 1 ? titles[0]?.[1]?.trim() : "";
  if (!title) {
    errors.push(`${route}: expected exactly one non-empty title`);
  }

  if (countMatches(html, /<meta\b[^>]*\bname=(['"])description\1[^>]*>/gi) !== 1) {
    errors.push(`${route}: expected exactly one meta description`);
  }
  if (countMatches(html, /<link\b[^>]*\brel=(['"])canonical\1[^>]*>/gi) !== 1) {
    errors.push(`${route}: expected exactly one canonical link`);
  }
  if (countMatches(html, /<link\b[^>]*\brel=(['"])icon\1[^>]*>/gi) < 1) {
    errors.push(`${route}: favicon link is missing`);
  }
  if (countMatches(html, /<meta\b[^>]*\bproperty=(['"])og:image\1[^>]*>/gi) !== 1) {
    errors.push(`${route}: expected exactly one og:image`);
  }
  if (countMatches(html, /<script\b[^>]*\btype=(['"])application\/ld\+json\1[^>]*>/gi) < 1) {
    errors.push(`${route}: JSON-LD is missing`);
  }

  const h1Count = countMatches(html, /<h1\b/gi);
  if (h1Count !== 1) errors.push(`${route}: expected exactly one H1, found ${h1Count}`);
  if (!/<main\b/i.test(html) || !/<body\b[^>]*>[\s\S]*\S[\s\S]*<\/body>/i.test(html)) {
    errors.push(`${route}: generated HTML shell is empty or missing main content`);
  }

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/i.test(image[0])) {
      errors.push(`${route}: img element is missing an alt attribute`);
    }
  }

  return title || null;
};

const requireFile = (root, name, errors) => {
  const path = join(root, name);
  if (!existsSync(path)) errors.push(`${name}: required build artifact is missing`);
  return path;
};

export const auditDist = async (root, options = {}) => {
  const distRoot = resolve(root);
  const errors = [];
  const files = await walkFiles(distRoot);
  const pageTitles = new Map();
  let jsBytes = 0;
  let largestJsBytes = 0;

  for (const path of files) {
    const extension = extname(path).toLowerCase();
    if (extension === ".map") {
      errors.push(`${relative(distRoot, path)}: source map exposed in static output`);
    }
    if (extension === ".js") {
      const bytes = (await stat(path)).size;
      jsBytes += bytes;
      largestJsBytes = Math.max(largestJsBytes, bytes);
    }
    if (extension === ".html") {
      const title = inspectHtml(path, await readFile(path, "utf8"), errors);
      if (title) {
        const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
        const route = relative(distRoot, path).replaceAll("\\", "/");
        const firstRoute = pageTitles.get(normalizedTitle);
        if (firstRoute) {
          errors.push(`${route}: duplicate page title "${title}" also used by ${firstRoute}`);
        } else {
          pageTitles.set(normalizedTitle, route);
        }
      }
    }
  }

  const robotsPath = requireFile(distRoot, "robots.txt", errors);
  const sitemapPath = requireFile(distRoot, "sitemap.xml", errors);
  requireFile(distRoot, "llms.txt", errors);
  requireFile(distRoot, "favicon.svg", errors);
  const socialCardPath = requireFile(distRoot, "brand/social-card.png", errors);

  if (existsSync(robotsPath)) {
    const robots = await readFile(robotsPath, "utf8");
    if (!/^User-agent:\s*\*/mi.test(robots) || !/^Allow:\s*\//mi.test(robots) || !/^Sitemap:\s*https:\/\//mi.test(robots)) {
      errors.push("robots.txt: expected public allow rules and an HTTPS sitemap URL");
    }
  }
  if (existsSync(sitemapPath)) {
    const sitemap = await readFile(sitemapPath, "utf8");
    if (!/<(?:urlset|sitemapindex)\b/i.test(sitemap)) {
      errors.push("sitemap.xml: expected a sitemap or sitemap index document");
    }
  }
  if (existsSync(socialCardPath)) {
    const image = await readFile(socialCardPath);
    const signature = image.subarray(0, 8).toString("hex");
    const width = image.length >= 24 ? image.readUInt32BE(16) : 0;
    const height = image.length >= 24 ? image.readUInt32BE(20) : 0;
    if (signature !== "89504e470d0a1a0a" || width !== 1200 || height !== 630) {
      errors.push("brand/social-card.png: expected a 1200x630 PNG social preview");
    }
  }

  const maxLargestJsBytes = Number.isFinite(options.maxLargestJsBytes)
    ? options.maxLargestJsBytes
    : await defaultJsBudget();
  if (largestJsBytes > maxLargestJsBytes) {
    errors.push(`JavaScript budget exceeded: largest bundle ${largestJsBytes} bytes > ${maxLargestJsBytes} bytes`);
  }

  return {
    errors: errors.sort(),
    metrics: { jsBytes, largestJsBytes },
  };
};

const main = async () => {
  const root = process.argv[2] ?? "dist";
  const result = await auditDist(root);
  console.log(`site-quality: jsBytes=${result.metrics.jsBytes} largestJsBytes=${result.metrics.largestJsBytes}`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`site-quality: ${error}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
