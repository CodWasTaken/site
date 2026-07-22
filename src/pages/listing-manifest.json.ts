import type { APIRoute } from "astro";
import { getCatalogIndex, getDatasetMetadata } from "../lib/catalog";

export const prerender = true;

export const GET: APIRoute = async () => {
  const records = await getCatalogIndex();
  return new Response(
    JSON.stringify({
      metadata: await getDatasetMetadata(),
      listingIds: records.map((record) => record.id),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    },
  );
};
