import type { APIRoute } from "astro";
import { getDatasetMetadata } from "../../lib/catalog";

export const prerender = true;
export const GET: APIRoute = async () => new Response(JSON.stringify({ metadata: await getDatasetMetadata(), tombstones: [] }), { headers: { "content-type": "application/json; charset=utf-8" } });
