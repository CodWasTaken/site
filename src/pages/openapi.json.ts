import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { APIRoute } from "astro";
import { getDataRepositoryRoot } from "../lib/data-path";

export const prerender = true;
export const GET: APIRoute = async () => {
  const components = JSON.parse(await readFile(resolve(await getDataRepositoryRoot(), "generated/openapi-components.json"), "utf8"));
  return new Response(JSON.stringify({
    openapi: "3.1.0",
    info: { title: "PerkCommons public catalogue API", version: "1.0.0", license: { name: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" } },
    servers: [{ url: "https://perkcommons.com" }],
    paths: {
      "/api/v1/opportunities": { get: { summary: "List published opportunities", parameters: [{ name: "cursor", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "Paginated opportunity records" } } } },
      "/api/v1/providers": { get: { summary: "List providers", responses: { "200": { description: "Provider index" } } } },
      "/api/v1/categories": { get: { summary: "List categories", responses: { "200": { description: "Category taxonomy" } } } }
    },
    ...components,
  }), { headers: { "content-type": "application/json; charset=utf-8" } });
};
