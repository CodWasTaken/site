import { requireModerator } from "./worker/lib/auth";
import { isListingRemovedWithoutEdgeCache } from "./worker/lib/listing-state";
import { vercelEnv } from "./vercel/runtime-env";

export const listingIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/opportunities\/([a-z0-9-]+)\/?$/);
  return match?.[1] ?? null;
};

const continueRouting = (): Response =>
  new Response(null, {
    headers: { "x-middleware-next": "1" },
  });

const removedListingResponse = (): Response =>
  new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Listing removed - PerkCommons</title></head><body><main><h1>Listing removed</h1><p>This opportunity was removed after moderator review.</p><p><a href="/opportunities/">Browse other opportunities</a></p></main></body></html>',
    {
      status: 410,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let env;
  try {
    env = vercelEnv();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "vercel_runtime_configuration_failed",
        route: "middleware",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return new Response("Service configuration is unavailable.", { status: 503 });
  }

  const listingId = listingIdFromPath(url.pathname);
  if (
    request.method === "GET" &&
    listingId &&
    (await isListingRemovedWithoutEdgeCache(env, listingId))
  )
    return removedListingResponse();

  if (url.pathname === "/moderate" || url.pathname.startsWith("/moderate/")) {
    try {
      await requireModerator(request, env);
    } catch {
      const login = new URL("/moderator-login/", request.url);
      login.searchParams.set("next", "/moderate/");
      return Response.redirect(login.toString(), 302);
    }
  }

  return continueRouting();
}

export const config = {
  matcher: ["/opportunities/:path*", "/moderate", "/moderate/:path*"],
  runtime: "nodejs",
};
