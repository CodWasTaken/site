import { handleCronRequest } from "./cron/reconcile";
import { routeApiRequest } from "../worker/lib/api-router";
import { installVercelRuntimeCompatibility } from "../vercel/runtime-compat";
import { vercelEnv } from "../vercel/runtime-env";

installVercelRuntimeCompatibility();

const normalizeApiRequest = async (request: Request): Promise<Request> => {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get("__pc_path");
  if (!rewrittenPath) return request;

  const cleanPath = rewrittenPath.replace(/^\/+|\/+$/g, "");
  url.pathname = cleanPath ? `/api/${cleanPath}` : "/api";
  url.searchParams.delete("__pc_path");

  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: request.redirect,
    signal: request.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }
  return new Request(url, init);
};

const unavailable = (): Response =>
  Response.json(
    {
      error: {
        code: "service_unavailable",
        message: "The service is not configured.",
      },
    },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );

export default {
  async fetch(request: Request): Promise<Response> {
    let env;
    try {
      env = vercelEnv();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "vercel_runtime_configuration_failed",
          route: "api",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      return unavailable();
    }

    const normalized = await normalizeApiRequest(request);
    if (new URL(normalized.url).pathname === "/api/cron/reconcile")
      return handleCronRequest(normalized, env);
    return routeApiRequest(normalized, env);
  },
};
