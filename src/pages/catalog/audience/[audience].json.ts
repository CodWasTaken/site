import type { APIRoute } from "astro";
import { getCatalogIndex, getDatasetMetadata } from "../../../lib/catalog";

const audiences = ["startups", "students", "nonprofits", "developers", "open-source-maintainers", "researchers"];
const matches: Record<string, string[]> = {
  startups: ["startup", "founder", "company"], students: ["student", "education"], nonprofits: ["nonprofit", "charity", "ngo"],
  developers: ["developer", "engineering", "api"], "open-source-maintainers": ["open-source", "maintainer"], researchers: ["research", "academic"],
};
export const prerender = true;
export function getStaticPaths() { return audiences.map((audience) => ({ params: { audience }, props: { audience } })); }
export const GET: APIRoute = async ({ props }) => {
  const audience = String(props.audience);
  const terms = matches[audience] ?? [];
  const records = (await getCatalogIndex()).filter((record) => terms.some((term) => `${record.category} ${record.tags.join(" ")} ${record.eligibility}`.toLowerCase().includes(term)));
  return new Response(JSON.stringify({ metadata: await getDatasetMetadata(), audience, inference: "Legacy v1 audience shard inferred from category, tags, and eligibility; human-confirmed structured audiences require v2 review.", records }), { headers: { "content-type": "application/json; charset=utf-8" } });
};
