import { reconcilePublicationBatches } from "../../worker/lib/publication";
import { reconcileListingRemovals } from "../../worker/lib/removal";
import type { Env } from "../../worker/lib/types";
import { vercelEnv } from "../../vercel/runtime-env";

export const authorizeCron = (
  authorization: string | null | undefined,
  secret: string | undefined,
): boolean => Boolean(secret && authorization === `Bearer ${secret}`);

interface ReconciliationOperations {
  publications(env: Env): Promise<void>;
  removals(env: Env): Promise<void>;
}

const defaultOperations: ReconciliationOperations = {
  publications: reconcilePublicationBatches,
  removals: reconcileListingRemovals,
};

export async function runReconciliation(
  env: Env,
  operations: ReconciliationOperations = defaultOperations,
): Promise<void> {
  await operations.publications(env);
  await operations.removals(env);
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

export async function handleCronRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET")
    return json(
      { error: { code: "method_not_allowed", message: "Method not allowed." } },
      405,
    );

  if (!authorizeCron(request.headers.get("authorization"), env.CRON_SECRET))
    return json(
      { error: { code: "unauthorized", message: "Cron authorization failed." } },
      401,
    );

  try {
    await reconcilePublicationBatches(env);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "vercel_reconciliation_failed",
        phase: "publication",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return json(
      {
        error: {
          code: "reconciliation_failed",
          message: "Reconciliation failed.",
        },
      },
      500,
    );
  }

  try {
    await reconcileListingRemovals(env);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "vercel_reconciliation_failed",
        phase: "removal",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return json(
      {
        error: {
          code: "reconciliation_failed",
          message: "Reconciliation failed.",
        },
      },
      500,
    );
  }

  return json({ ok: true });
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handleCronRequest(request, vercelEnv());
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "vercel_runtime_configuration_failed",
          route: "cron",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      return json(
        {
          error: {
            code: "service_unavailable",
            message: "The service is not configured.",
          },
        },
        503,
      );
    }
  },
};
