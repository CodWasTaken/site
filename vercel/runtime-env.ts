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
    TURNSTILE_SECRET_KEY: optional(source, "TURNSTILE_SECRET_KEY"),
    GITHUB_DATA_PUBLICATION_TOKEN: optional(
      source,
      "GITHUB_DATA_PUBLICATION_TOKEN",
    ),
    GITHUB_DATA_REPOSITORY:
      optional(source, "GITHUB_DATA_REPOSITORY") ?? "CodWasTaken/data",
    GITHUB_DATA_BRANCH: optional(source, "GITHUB_DATA_BRANCH") ?? "main",
    GITHUB_HEAD_OWNER: optional(source, "GITHUB_HEAD_OWNER") ?? "CodWasTaken",
    GITHUB_SITE_REPOSITORY: optional(source, "GITHUB_SITE_REPOSITORY"),
    FORK_ONLY_MODE: "true",
    VERCEL_DEPLOY_HOOK_URL: optional(source, "VERCEL_DEPLOY_HOOK_URL"),
    CRON_SECRET: optional(source, "CRON_SECRET"),
  };

  githubTargetConfig(env);
  return env;
}
