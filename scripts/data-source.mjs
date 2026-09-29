const VERCEL_DATA_REPOSITORY =
  "https://github.com/CodWasTaken/data.git";
const VERCEL_DEFAULT_REF = "main";

/**
 * Resolve the public data source without allowing builds to drift to the
 * original PerkCommons organization. Release builds may pin an exact commit.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ repository: string, ref: string | undefined }}
 */
export function resolveDataSource(env = process.env) {
  const isVercel = env.VERCEL === "1";
  const configuredRepository = env.PERKCOMMONS_DATA_REPOSITORY?.trim();
  const configuredRef = env.PERKCOMMONS_DATA_REF?.trim();

  const repository =
    configuredRepository || (isVercel ? VERCEL_DATA_REPOSITORY : "");
  const ref = configuredRef || (isVercel ? VERCEL_DEFAULT_REF : undefined);
  const isReleaseCandidate =
    isVercel && env.PERKCOMMONS_RELEASE_CANDIDATE?.trim() === "1";

  if (!repository) {
    throw new Error(
      "Set PERKCOMMONS_DATA_REPOSITORY to the CodWasTaken data repository.",
    );
  }
  if (/github\.com[/:]PerkCommons\//i.test(repository)) {
    throw new Error(
      "Vercel builds are restricted to CodWasTaken/data; original PerkCommons repositories are not accepted.",
    );
  }
  if (isVercel && repository !== VERCEL_DATA_REPOSITORY) {
    throw new Error(
      "Vercel builds are restricted to CodWasTaken/data.",
    );
  }
  if (
    isReleaseCandidate &&
    (!configuredRef || !/^[0-9a-f]{40}$/i.test(configuredRef))
  ) {
    throw new Error(
      "PERKCOMMONS_DATA_REF must be an exact 40-character commit SHA for release-candidate Vercel builds.",
    );
  }

  return { repository, ref };
}