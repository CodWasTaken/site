import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { getDataRepositoryRoot } from "./data-path";
import {
  getListings,
  isDefaultOpportunity,
  type Listing,
  type ListingStatus,
} from "./listings";
import { categories } from "./taxonomy";

const execFileAsync = promisify(execFile);

export type CatalogResourceType =
  | "opportunity" | "resource" | "benefit" | "program" | "event" | "funding"
  | "fellowship" | "competition" | "community" | "learning-resource"
  | "public-dataset" | "general-free-product";

export interface CatalogIndexRecord {
  id: string;
  provider: string;
  title: string;
  aliases: string[];
  description: string;
  eligibility: string;
  benefit: string;
  category: string;
  categoryLabel: string;
  subcategories: string[];
  tags: string[];
  regions: string[];
  status: ListingStatus;
  reviewDate: string;
  sponsored: boolean;
  resourceType: CatalogResourceType;
  defaultSearchEligible: boolean | null;
  canonicalUrl: string;
  destinationUrl: string;
  addedAt: string | null;
}

export interface DatasetMetadata {
  datasetVersion: string;
  dataCommitSha: string;
  siteCommitSha: string;
  schemaVersion: string;
  taxonomyVersion: string;
  generatedAt: string;
  license: { id: "CC0-1.0"; url: string };
}

export const resourceTypeFor = (listing: Listing): CatalogResourceType => {
  if (listing.resourceType) return listing.resourceType as CatalogResourceType;
  const mapping: Partial<Record<Listing["category"], CatalogResourceType>> = {
    funding: "funding",
    fellowships: "fellowship",
    "competitions-hackathons": "competition",
    "events-conferences": "event",
    "mentorship-community": "community",
    "education-training": "learning-resource",
    "research-opportunities": "resource",
    "discounts-perks": "benefit",
    "startup-benefits": "benefit",
    "student-benefits": "benefit",
    "nonprofit-benefits": "benefit",
  };
  return mapping[listing.category] ?? "opportunity";
};

export async function getCatalogIndex(): Promise<CatalogIndexRecord[]> {
  return (await getListings()).map((listing) => ({
    id: listing.id,
    provider: listing.provider,
    title: listing.title,
    aliases: listing.aliases ?? [],
    description: listing.description,
    eligibility: listing.eligibility,
    benefit: listing.value,
    category: listing.category,
    categoryLabel: categories[listing.category],
    subcategories: listing.subcategories,
    tags: listing.tags,
    regions: listing.regions ?? [],
    status: listing.status,
    reviewDate: listing.reviewDate,
    sponsored: listing.sponsor,
    resourceType: resourceTypeFor(listing),
    defaultSearchEligible: listing.defaultSearchEligible ?? null,
    canonicalUrl: `/opportunities/${listing.id}/`,
    destinationUrl: listing.applicationUrl ?? listing.programUrl ?? listing.officialUrl,
    addedAt: null,
  }));
}

const gitSha = async (directory: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: directory });
    return stdout.trim();
  } catch {
    return "unavailable";
  }
};

export async function getDatasetMetadata(): Promise<DatasetMetadata> {
  const dataRoot = await getDataRepositoryRoot();
  const taxonomy = JSON.parse(await readFile(resolve(dataRoot, "taxonomy/opportunity-taxonomy.json"), "utf8")) as { version: number | string };
  const generatedAt = process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
    : new Date().toISOString();
  const dataCommitSha = process.env.PERKCOMMONS_DATA_SHA || await gitSha(dataRoot);
  const siteCommitSha = process.env.PERKCOMMONS_SITE_SHA || await gitSha(process.cwd());
  return {
    datasetVersion: dataCommitSha,
    dataCommitSha,
    siteCommitSha,
    schemaVersion: "1+2.0",
    taxonomyVersion: String(taxonomy.version),
    generatedAt,
    license: { id: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  };
}

export const publicCatalogRecords = (records: CatalogIndexRecord[]) =>
  records.filter(isDefaultOpportunity);
