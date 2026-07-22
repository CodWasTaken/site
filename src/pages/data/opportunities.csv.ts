import type { APIRoute } from "astro";
import { getDatasetMetadata } from "../../lib/catalog";
import { getListings } from "../../lib/listings";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export const prerender = true;
export const GET: APIRoute = async () => {
  const metadata = await getDatasetMetadata();
  const header = ["datasetVersion", "dataCommitSha", "schemaVersion", "taxonomyVersion", "generatedAt", "license", "canonicalRecordUrl", "id", "provider", "title", "category", "status", "reviewDate", "officialUrl"];
  const rows = (await getListings()).map((record) => [metadata.datasetVersion, metadata.dataCommitSha, metadata.schemaVersion, metadata.taxonomyVersion, metadata.generatedAt, metadata.license.id, `/opportunities/${record.id}/`, record.id, record.provider, record.title, record.category, record.status, record.reviewDate, record.officialUrl]);
  return new Response(`${header.map(csv).join(",")}\n${rows.map((row) => row.map(csv).join(",")).join("\n")}\n`, { headers: { "content-type": "text/csv; charset=utf-8" } });
};
