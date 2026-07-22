import type { APIRoute } from "astro";
import { getCatalogIndex, getDatasetMetadata } from "../lib/catalog";

export const prerender = true;
export const GET: APIRoute = async () => new Response(JSON.stringify({ metadata: await getDatasetMetadata(), records: await getCatalogIndex() }), { headers: { "content-type": "application/json; charset=utf-8" } });
