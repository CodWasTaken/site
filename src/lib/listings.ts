import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { getDataRepositoryRoot } from "./data-path";
import {
  normalizeCategoryId,
  normalizeSubcategories,
  type CategoryId,
} from "./taxonomy";

export { categories } from "./taxonomy";

export type ListingStatus =
  | "active" | "open" | "rolling" | "upcoming" | "limited" | "waitlist"
  | "temporarily-unavailable" | "closed" | "unconfirmed" | "expired"
  | "disputed" | "archived";

export interface ListingEvidence {
  type: string;
  url: string;
  checkedAt: string | null;
  claim: string | null;
}

export interface Listing {
  schemaVersion?: "1" | "2.0";
  id: string;
  provider: string;
  title: string;
  category: CategoryId;
  subcategories: string[];
  tags: string[];
  description: string;
  eligibility: string;
  value: string;
  sourceUrl: string;
  officialUrl: string;
  status: ListingStatus;
  submissionType: "community" | "company" | "maintainer";
  sponsor: boolean;
  reviewDate: string;
  regions?: string[];
  notes?: string;
  aliases?: string[];
  resourceType?: string;
  defaultSearchEligible?: boolean | null;
  providerUrl?: string | null;
  programUrl?: string | null;
  applicationUrl?: string | null;
  evidenceUrls?: ListingEvidence[];
  deadline?: string | null;
  deadlineType?: string | null;
  global?: boolean | null;
  remote?: boolean | null;
  countries?: string[];
  reviewedAt?: string | null;
  nextReviewAt?: string | null;
  claimsChecked?: string[];
}

let cache: Listing[] | undefined;

export function normalizeListingRecord(
  raw: Record<string, unknown>,
  source = "record",
): Listing {
  if (raw.schemaVersion === "2.0") {
    const classification = raw.classification as Record<string, unknown>;
    const urls = raw.urls as Record<string, unknown>;
    const availability = raw.availability as Record<string, unknown>;
    const geography = raw.geography as Record<string, unknown>;
    const costAndBenefit = raw.costAndBenefit as Record<string, unknown>;
    const eligibility = raw.eligibility as Record<string, unknown>;
    const provenance = raw.reviewProvenance as Record<string, unknown>;
    const sponsorship = raw.sponsorship as Record<string, unknown>;
    const category = normalizeCategoryId(classification.primaryCategory);
    if (!category) throw new Error(`${source}: unknown opportunity category`);
    const evidenceUrls = Array.isArray(urls.evidenceUrls)
      ? urls.evidenceUrls as ListingEvidence[]
      : [];
    const countries = Array.isArray(geography.countries)
      ? geography.countries.filter((item): item is string => typeof item === "string")
      : [];
    const physicalLocations = Array.isArray(geography.physicalLocations)
      ? geography.physicalLocations.filter((item): item is string => typeof item === "string")
      : [];
    const regions = [
      ...(geography.global === true ? ["Global"] : countries),
      ...(geography.remote === true ? ["Remote"] : []),
      ...physicalLocations,
    ];
    const reviewedAt = typeof provenance.reviewedAt === "string"
      ? provenance.reviewedAt
      : null;
    return {
      schemaVersion: "2.0",
      id: String(raw.id),
      provider: String(raw.provider),
      title: String(raw.title),
      category,
      subcategories: normalizeSubcategories(category, classification.subcategories),
      tags: Array.isArray(classification.topics) ? classification.topics as string[] : [],
      description: String(raw.description),
      eligibility: String(eligibility.summary),
      value: String(costAndBenefit.benefitSummary),
      sourceUrl: evidenceUrls[0]?.url ?? String(urls.programUrl ?? urls.providerUrl ?? raw.canonicalUrl),
      officialUrl: String(urls.applicationUrl ?? urls.programUrl ?? urls.providerUrl ?? evidenceUrls[0]?.url ?? raw.canonicalUrl),
      status: availability.status as ListingStatus,
      submissionType: "community",
      sponsor: sponsorship.sponsored === true,
      reviewDate: reviewedAt?.slice(0, 10) ?? "1970-01-01",
      regions: [...new Set(regions)],
      aliases: Array.isArray(raw.aliases) ? raw.aliases as string[] : [],
      resourceType: String(classification.resourceType),
      defaultSearchEligible: typeof classification.defaultSearchEligible === "boolean"
        ? classification.defaultSearchEligible
        : null,
      providerUrl: typeof urls.providerUrl === "string" ? urls.providerUrl : null,
      programUrl: typeof urls.programUrl === "string" ? urls.programUrl : null,
      applicationUrl: typeof urls.applicationUrl === "string" ? urls.applicationUrl : null,
      evidenceUrls,
      deadline: typeof availability.closesAt === "string" ? availability.closesAt : null,
      deadlineType: typeof availability.deadlineType === "string" ? availability.deadlineType : null,
      global: typeof geography.global === "boolean" ? geography.global : null,
      remote: typeof geography.remote === "boolean" ? geography.remote : null,
      countries,
      reviewedAt,
      nextReviewAt: typeof provenance.nextReviewAt === "string" ? provenance.nextReviewAt : null,
      claimsChecked: Array.isArray(provenance.claimsChecked) ? provenance.claimsChecked as string[] : [],
    } satisfies Listing;
  }
  const legacy = raw as Omit<Listing, "category" | "subcategories"> & {
    category: unknown;
    subcategories?: unknown;
  };
  const category = normalizeCategoryId(legacy.category);
  if (!category) throw new Error(`${source}: unknown opportunity category`);
  return {
    ...legacy,
    schemaVersion: "1",
    category,
    subcategories: normalizeSubcategories(category, legacy.subcategories),
  };
}

export async function getListings(): Promise<Listing[]> {
  if (cache) return cache;
  const directory = process.env.PERKCOMMONS_DATA_PATH
    ? resolve(process.env.PERKCOMMONS_DATA_PATH)
    : resolve(await getDataRepositoryRoot(), "opportunities");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && !file.startsWith("_"));
  cache = await Promise.all(
    files.map(async (file) => normalizeListingRecord(
      JSON.parse(await readFile(resolve(directory, file), "utf8")) as Record<string, unknown>,
      file,
    )),
  );
  return cache.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate) || a.title.localeCompare(b.title));
}

export function isDefaultOpportunity(
  listing: Pick<Listing, "defaultSearchEligible" | "status">,
): boolean {
  return listing.defaultSearchEligible !== false &&
    !["expired", "disputed", "archived"].includes(listing.status);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function statusLabel(status: ListingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
