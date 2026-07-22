import type { APIRoute } from "astro";
import { getCatalogIndex, getDatasetMetadata } from "../lib/catalog";

export const prerender = true;
export const GET: APIRoute = async () => {
  const records = await getCatalogIndex();
  const providers = [...new Set(records.map((record) => record.provider))].sort().map((provider) => ({
    provider,
    aliases: [],
    currentCount: records.filter((record) => record.provider === provider && !["expired", "disputed", "archived"].includes(record.status)).length,
    archivedCount: records.filter((record) => record.provider === provider && ["expired", "archived"].includes(record.status)).length,
    lastReviewedAt: records.filter((record) => record.provider === provider).map((record) => record.reviewDate).sort().at(-1) ?? null,
  }));
  return new Response(JSON.stringify({ metadata: await getDatasetMetadata(), providers }), { headers: { "content-type": "application/json; charset=utf-8" } });
};
