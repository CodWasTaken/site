import type { APIRoute } from "astro";
import { getCatalogIndex, getDatasetMetadata, publicCatalogRecords } from "../lib/catalog";

export const prerender = true;
export const GET: APIRoute = async () => {
  const records = publicCatalogRecords(await getCatalogIndex());
  const count = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
  return new Response(JSON.stringify({
    metadata: await getDatasetMetadata(),
    facets: {
      category: count(records.map((record) => record.category)),
      provider: count(records.map((record) => record.provider)),
      status: count(records.map((record) => record.status)),
      region: count(records.flatMap((record) => record.regions)),
      resourceType: count(records.map((record) => record.resourceType)),
    },
  }), { headers: { "content-type": "application/json; charset=utf-8" } });
};
