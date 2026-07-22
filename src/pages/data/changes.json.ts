import type { APIRoute } from "astro";
import { getDatasetMetadata } from "../../lib/catalog";

export const prerender = true;
export const GET: APIRoute = async () => new Response(JSON.stringify({ metadata: await getDatasetMetadata(), semantics: "Append-only change events will be keyed by data commit and record ID. This snapshot contains no inferred historical events.", available: false, changes: [] }), { headers: { "content-type": "application/json; charset=utf-8" } });
