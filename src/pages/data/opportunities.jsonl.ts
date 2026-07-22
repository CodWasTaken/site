import type { APIRoute } from "astro";
import { getDatasetMetadata } from "../../lib/catalog";
import { getListings } from "../../lib/listings";

export const prerender = true;
export const GET: APIRoute = async () => {
  const metadata = await getDatasetMetadata();
  const lines = [JSON.stringify({ type: "metadata", ...metadata }), ...(await getListings()).map((record) => JSON.stringify({ type: "record", canonicalRecordUrl: `/opportunities/${record.id}/`, record }))];
  return new Response(`${lines.join("\n")}\n`, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
};
