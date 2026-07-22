import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { APIRoute } from "astro";
import { getDataRepositoryRoot } from "../../lib/data-path";

export const prerender = true;
export const GET: APIRoute = async () => new Response(await readFile(resolve(await getDataRepositoryRoot(), "schema/opportunity-v2.schema.json"), "utf8"), { headers: { "content-type": "application/schema+json; charset=utf-8" } });
