import { requireModerator } from "./lib/auth";
import { apiError, json, methodNotAllowed, RequestError, withSecurityHeaders } from "./lib/http";
import type { Env } from "./lib/types";
import { reconcilePublicationBatches } from "./lib/publication";
import { reconcileListingRemovals } from "./lib/removal";
import {
  bans,
  canonicalListingDetail,
  createListingUpdate,
  createBan,
  createSession,
  currentModerator,
  destroySession,
  featureListing,
  isListingRemoved,
  moderationAction,
  moderationError,
  moderators,
  queue,
  queueSummary,
  publicListingState,
  publications,
  purgeRejected,
  removeBan,
  reports,
  resolveReport,
  submissionDetail,
  unconfirmedListings,
} from "./routes/moderation";
import {
  handlePublicError,
  handlePublicReport,
  handlePublicSubmission,
} from "./routes/public";

const submissionActionPattern =
  /^\/api\/moderation\/submissions\/([0-9a-f-]+)\/(approve|decline|flag|unflag|undo|notes)$/i;
const submissionDetailPattern =
  /^\/api\/moderation\/submissions\/([0-9a-f-]+)$/i;
const banPattern = /^\/api\/moderation\/bans\/([0-9a-f-]+)$/i;
const reportPattern = /^\/api\/moderation\/reports\/([0-9a-f-]+)\/resolve$/i;
const featurePattern = /^\/api\/moderation\/listings\/([a-z0-9-]+)\/feature$/;
const listingUpdatePattern =
  /^\/api\/moderation\/listings\/([a-z0-9-]+)\/updates$/;
const canonicalListingPattern =
  /^\/api\/moderation\/listings\/([a-z0-9-]+)$/;
const publicListingPattern = /^\/opportunities\/([a-z0-9-]+)\/?$/;

async function publicCatalogApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const assets: Record<string, string> = {
    "/api/v1/opportunities": "/data/opportunities.json",
    "/api/v1/providers": "/provider-index.json",
    "/api/v1/categories": "/facet-counts.json",
  };
  const assetPath = assets[url.pathname];
  if (!assetPath) return null;
  if (request.method !== "GET") return methodNotAllowed();
  const assetUrl = new URL(assetPath, request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
  if (!response.ok) return apiError("Catalogue asset unavailable.", 503, "catalogue_unavailable");
  const payload = await response.json<Record<string, unknown>>();
  if (url.pathname !== "/api/v1/opportunities") return json(payload);
  const all = Array.isArray(payload.records) ? payload.records : [];
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  let offset = 0;
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    try { offset = Math.max(0, Number.parseInt(atob(cursor), 10) || 0); }
    catch { return apiError("Cursor is invalid.", 400, "invalid_cursor"); }
  }
  const records = all.slice(offset, offset + limit);
  const nextOffset = offset + records.length;
  return json({
    metadata: payload.metadata,
    pagination: { limit, returned: records.length, total: all.length, nextCursor: nextOffset < all.length ? btoa(String(nextOffset)) : null },
    records,
  });
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    const catalogResponse = await publicCatalogApi(request, env);
    if (catalogResponse) return catalogResponse;
    if (path === "/api/submissions")
      return request.method === "POST"
        ? await handlePublicSubmission(request, env)
        : methodNotAllowed();
    if (path === "/api/reports")
      return request.method === "POST"
        ? await handlePublicReport(request, env)
        : methodNotAllowed();
    if (path === "/api/listings/state")
      return request.method === "GET"
        ? await publicListingState(request, env)
        : methodNotAllowed();
    if (path === "/api/auth/session")
      return request.method === "POST"
        ? await createSession(request, env)
        : methodNotAllowed();
    if (path === "/api/auth/logout")
      return request.method === "POST"
        ? destroySession(request)
        : methodNotAllowed();
    if (path === "/api/auth/me")
      return request.method === "GET"
        ? await currentModerator(request, env)
        : methodNotAllowed();
    if (path === "/api/moderation/queue")
      return request.method === "GET"
        ? await queue(request, env)
        : methodNotAllowed();
    if (path === "/api/moderation/queue/summary")
      return request.method === "GET"
        ? await queueSummary(request, env)
        : methodNotAllowed();
    if (path === "/api/moderation/reports")
      return request.method === "GET"
        ? await reports(request, env)
        : methodNotAllowed();
    if (path === "/api/moderation/listings/unconfirmed")
      return request.method === "GET"
        ? await unconfirmedListings(request, env)
        : methodNotAllowed();
    if (path === "/api/moderation/moderators")
      return request.method === "GET" || request.method === "POST"
        ? await moderators(request, env)
        : methodNotAllowed();
    if (path === "/api/moderation/bans")
      return request.method === "GET"
        ? await bans(request, env)
        : request.method === "POST"
          ? await createBan(request, env)
          : methodNotAllowed();
    if (path === "/api/moderation/rejected")
      return request.method === "DELETE"
        ? await purgeRejected(request, env, null)
        : methodNotAllowed();
    if (path === "/api/moderation/publications")
      return request.method === "GET" || request.method === "POST"
        ? await publications(request, env)
        : methodNotAllowed();
    const featureMatch = path.match(featurePattern);
    if (featureMatch?.[1])
      return request.method === "POST"
        ? await featureListing(request, env, featureMatch[1])
        : methodNotAllowed();
    const listingUpdateMatch = path.match(listingUpdatePattern);
    if (listingUpdateMatch?.[1])
      return request.method === "POST"
        ? await createListingUpdate(request, env, listingUpdateMatch[1])
        : methodNotAllowed();
    const canonicalListingMatch = path.match(canonicalListingPattern);
    if (canonicalListingMatch?.[1])
      return request.method === "GET"
        ? await canonicalListingDetail(
            request,
            env,
            canonicalListingMatch[1],
          )
        : methodNotAllowed();
    const detailMatch = path.match(submissionDetailPattern);
    if (detailMatch?.[1])
      return request.method === "GET"
        ? await submissionDetail(request, env, detailMatch[1])
        : request.method === "DELETE"
          ? await purgeRejected(request, env, detailMatch[1])
          : methodNotAllowed();
    const actionMatch = path.match(submissionActionPattern);
    if (actionMatch?.[1] && actionMatch[2])
      return request.method === "POST"
        ? await moderationAction(
            request,
            env,
            actionMatch[1],
            actionMatch[2].toLowerCase(),
          )
        : methodNotAllowed();
    const banMatch = path.match(banPattern);
    if (banMatch?.[1])
      return request.method === "DELETE"
        ? await removeBan(request, env, banMatch[1])
        : methodNotAllowed();
    const reportMatch = path.match(reportPattern);
    if (reportMatch?.[1])
      return request.method === "POST"
        ? await resolveReport(request, env, reportMatch[1])
        : methodNotAllowed();
    return new Response(
      JSON.stringify({
        error: { code: "not_found", message: "API route not found." },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    if (
      path === "/api/auth/me" &&
      error instanceof RequestError &&
      error.status === 401
    )
      return json({ moderator: null });
    return path === "/api/submissions" || path === "/api/reports"
      ? handlePublicError(error)
      : moderationError(error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return withSecurityHeaders(await api(request, env));
    const publicListing = url.pathname.match(publicListingPattern);
    if (
      request.method === "GET" &&
      publicListing?.[1] &&
      (await isListingRemoved(env, publicListing[1]))
    )
      return withSecurityHeaders(new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Listing removed - PerkCommons</title></head><body><main><h1>Listing removed</h1><p>This opportunity was removed after moderator review.</p><p><a href="/opportunities/">Browse other opportunities</a></p></main></body></html>',
        {
          status: 410,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        },
      ));
    if (url.pathname === "/moderate" || url.pathname.startsWith("/moderate/")) {
      try {
        await requireModerator(request, env);
      } catch {
        const login = new URL("/moderator-login/", request.url);
        login.searchParams.set("next", "/moderate/");
        return withSecurityHeaders(Response.redirect(login.toString(), 302));
      }
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    context.waitUntil(Promise.allSettled([
      reconcilePublicationBatches(env),
      reconcileListingRemovals(env),
    ]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") console.error(JSON.stringify({
          event: index === 0 ? "publication_cron_failed" : "removal_cron_failed",
          error: result.reason instanceof Error ? result.reason.name : "unknown",
        }));
      });
    }));
  },
} satisfies ExportedHandler<Env>;