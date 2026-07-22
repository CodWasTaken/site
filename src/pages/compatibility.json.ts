import type { APIRoute } from "astro";
import { getDatasetMetadata } from "../lib/catalog";

export const prerender = true;
export const GET: APIRoute = async () => {
  const metadata = await getDatasetMetadata();
  return new Response(JSON.stringify({
    siteVersion: "0.2.0-next",
    dataSchemaVersion: metadata.schemaVersion,
    taxonomyVersion: metadata.taxonomyVersion,
    minimumMigration: "202607220001_next_review_concurrency",
    dataCommit: metadata.dataCommitSha,
    siteCommit: metadata.siteCommitSha,
  }), { headers: { "content-type": "application/json; charset=utf-8" } });
};
