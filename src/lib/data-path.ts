import { access } from "node:fs/promises";
import { resolve } from "node:path";

export async function getDataRepositoryRoot(): Promise<string> {
  const candidates = [
    process.env.PERKCOMMONS_DATA_REPOSITORY_PATH,
    process.env.PERKCOMMONS_DATA_PATH
      ? resolve(process.env.PERKCOMMONS_DATA_PATH, "..")
      : undefined,
    resolve(process.cwd(), "../data"),
    resolve(process.cwd(), ".data"),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, "opportunities"));
      await access(resolve(candidate, "taxonomy/opportunity-taxonomy.json"));
      return candidate;
    } catch {
      // Continue to the next explicitly isolated data source.
    }
  }
  throw new Error(
    "No isolated PerkCommons data checkout is available. Set PERKCOMMONS_DATA_REPOSITORY_PATH or place the data fork beside the site fork.",
  );
}
