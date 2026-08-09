import { githubTargetConfig } from "../worker/lib/github-targets";
import type { Env } from "../worker/lib/types";

type EnvironmentSource = Record<string, string | undefined>;

const required = (source: EnvironmentSource, name: string): string => {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Vercel environment variable: ${name}`);
  }
  return value;
};

const optional = (
  source: EnvironmentSource,
  name: string,
): string | undefined => source[name]?.trim() || undefined;

export function vercelEnv(
  source: EnvironmentSource = process.env,
): Env {
  const env: Env = {
    SUPABASE_URL: required(source, "SUPABASE_URL"),
    SUPABASE_PUBLISHABLE_KEY: required(source, "SUPABASE_PUBLISHABLE_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: required(source, "SUPABASE_SERVICE_ROLE_KEY"),
    SUBMISSION_FINGERPRINT_SECRET: required(
      source,
      "SUBMISSION_FINGERPRINT_SECRET",
    ),
    GITHUB_DATA_REPOSITORY:
      optional(source, "GITHUB_DATA_REPOSITORY") ?? "CodWasTaken/data",
    GITHUB_DATA_BRANCH: optional(source, "GITHUB_DATA_BRANCH") ?? "main",
    GITHUB_HEAD_OWNER: optional(source, "GITHUB_HEAD_OWNER") ?? "CodWasTaken",
    FORK_ONLY_MODE: "true",
  };

  const turnstileSecret = optional(source, "TURNSTILE_SECRET_KEY");
  if (turnstileSecret) env.TURNSTILE_SECRET_KEY = turnstileSecret;

  const publicationToken = optional(source, "GITHUB_DATA_PUBLICATION_TOKEN");
  if (publicationToken) env.GITHUB_DATA_PUBLICATION_TOKEN = publicationToken;

  const siteRepository = optional(source, "GITHUB_SITE_REPOSITORY");
  if (siteRepository) env.GITHUB_SITE_REPOSITORY = siteRepository;

  const deployHook = optional(source, "VERCEL_DEPLOY_HOOK_URL");
  if (deployHook) env.VERCEL_DEPLOY_HOOK_URL = deployHook;

  const cronSecret = optional(source, "CRON_SECRET");
  if (cronSecret) env.CRON_SECRET = cronSecret;

  githubTargetConfig(env);
  return env;
}
