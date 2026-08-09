const VERCEL_DATA_REPOSITORY = "https://github.com/CodWasTaken/data.git";
const VERCEL_DATA_REF = "main";
const DEFAULT_DATA_REPOSITORY = "https://github.com/PerkCommons/data.git";

/**
 * Resolve the data source for a build without allowing Vercel deployments to
 * drift back to the original PerkCommons repository.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ repository: string, ref: string | undefined }}
 */
export function resolveDataSource(env = process.env) {
  const isVercel = env.VERCEL === "1";
  const configuredRepository = env.PERKCOMMONS_DATA_REPOSITORY?.trim();
  const configuredRef = env.PERKCOMMONS_DATA_REF?.trim();

  const repository =
    configuredRepository ||
    (isVercel ? VERCEL_DATA_REPOSITORY : DEFAULT_DATA_REPOSITORY);
  const ref = configuredRef || (isVercel ? VERCEL_DATA_REF : undefined);

  if (
    isVercel &&
    (repository !== VERCEL_DATA_REPOSITORY || ref !== VERCEL_DATA_REF)
  ) {
    throw new Error(
      "Vercel Next-development builds are restricted to CodWasTaken/data main",
    );
  }

  return { repository, ref };
}
