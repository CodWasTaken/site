import type { APIRoute } from "astro";
import { getCatalogIndex, getDatasetMetadata } from "../../../lib/catalog";
import { categoryDefinitions } from "../../../lib/taxonomy";

export const prerender = true;
export function getStaticPaths() {
  return categoryDefinitions.map((category) => ({ params: { category: category.id }, props: { category: category.id } }));
}
export const GET: APIRoute = async ({ props }) => {
  const category = String(props.category);
  return new Response(JSON.stringify({ metadata: await getDatasetMetadata(), category, records: (await getCatalogIndex()).filter((record) => record.category === category) }), { headers: { "content-type": "application/json; charset=utf-8" } });
};
