import type { APIRoute } from "astro";
import { getDatasetMetadata } from "../../lib/catalog";
import { getListings } from "../../lib/listings";

export const prerender = true;
export const GET: APIRoute = async () => new Response(JSON.stringify({ metadata: await getDatasetMetadata(), records: await getListings() }), { headers: { "content-type": "application/json; charset=utf-8" } });
