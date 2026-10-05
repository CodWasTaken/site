export type CatalogAssetPayloads = Readonly<Record<string, unknown>>;

export function createCatalogAssetsBinding(payloads: CatalogAssetPayloads): {
  fetch(request: Request): Promise<Response>;
} {
  return {
    async fetch(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname;
      const payload = payloads[path];
      if (payload === undefined) {
        return new Response("Not found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=0, must-revalidate",
        },
      });
    },
  };
}
