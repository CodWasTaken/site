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

export type EditorialReviewState =
  | "human-reviewed"
  | "automated-research-pending-human-review"
  | "legacy-source-checked"
  | "unconfirmed";

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
  applicationCycle?: string | null;
  global?: boolean | null;
  remote?: boolean | null;
  countries?: string[];
  physicalLocations?: string[];
  statusReason?: string | null;
  reviewedAt?: string | null;
  nextReviewAt?: string | null;
  claimsChecked?: string[];
  sponsorshipType?: string | null;
  sponsorshipDisclosure?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  reviewMethod: string | null;
  reviewState: string | null;
  reviewerReference: string | null;
  editorialReviewState: EditorialReviewState;
  verified: boolean;
}


const blockedVerificationStatuses = new Set<ListingStatus>([
  "unconfirmed",
  "expired",
  "disputed",
  "archived",
]);

const validEvidenceUrl = (evidence: ListingEvidence): boolean => {
  try {
    return new URL(evidence.url).protocol === "https:";
  } catch {
    return false;
  }
};

export function deriveEditorialReviewState(input: {
  schemaVersion: "1" | "2.0";
  reviewMethod: string | null;
  reviewState: string | null;
  reviewerReference: string | null;
  reviewedAt: string | null;
}): EditorialReviewState {
  if (input.schemaVersion === "1") return "legacy-source-checked";
  const humanMethod =
    input.reviewMethod === "human" || input.reviewMethod === "human-assisted";
  const humanState =
    input.reviewState === "human-reviewed" || input.reviewState === "published";
  const humanReviewer =
    Boolean(input.reviewerReference) &&
    !input.reviewerReference!.startsWith("automation:");
  if (humanMethod && humanState && humanReviewer && input.reviewedAt)
    return "human-reviewed";
  if (
    input.reviewMethod === "automated-source-research" ||
    input.reviewState === "needs-human-review" ||
    input.reviewState === "automated-lint-passed"
  )
    return "automated-research-pending-human-review";
  return "unconfirmed";
}

const qualifiesAsVerified = (input: {
  editorialReviewState: EditorialReviewState;
  status: ListingStatus;
  evidenceUrls: ListingEvidence[];
  claimsChecked: string[];
  applicationUrl: string | null;
  deadline: string | null;
  deadlineType: string | null;
  global: boolean | null;
  remote: boolean | null;
  countries: string[];
  nextReviewAt: string | null;
}): boolean => {
  if (input.editorialReviewState !== "human-reviewed") return false;
  if (blockedVerificationStatuses.has(input.status)) return false;
  if (!input.evidenceUrls.some(validEvidenceUrl)) return false;
  if (!input.nextReviewAt) return false;
  const claims = new Set(input.claimsChecked);
  if (!claims.has("program-exists") || !claims.has("eligibility")) return false;
  if (input.applicationUrl && !claims.has("application-url")) return false;
  if (input.deadlineType === "fixed" && input.deadline && !claims.has("deadline"))
    return false;
  const geographyKnown =
    input.global !== null || input.remote !== null || input.countries.length > 0;
  if (!geographyKnown || !claims.has("geography")) return false;
  return true;
};

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
    const reviewMethod = typeof provenance.reviewMethod === "string"
      ? provenance.reviewMethod
      : null;
    const reviewState = typeof classification.reviewState === "string"
      ? classification.reviewState
      : null;
    const reviewerReference = typeof provenance.reviewerReference === "string"
      ? provenance.reviewerReference
      : null;
    const claimsChecked = Array.isArray(provenance.claimsChecked)
      ? provenance.claimsChecked.filter((item): item is string => typeof item === "string")
      : [];
    const nextReviewAt = typeof provenance.nextReviewAt === "string"
      ? provenance.nextReviewAt
      : null;
    const sourceFetchedAt = typeof provenance.sourceFetchedAt === "string"
      ? provenance.sourceFetchedAt
      : null;
    const reviewDate =
      reviewedAt?.slice(0, 10) ??
      sourceFetchedAt?.slice(0, 10) ??
      evidenceUrls.find((evidence) => evidence.checkedAt)?.checkedAt?.slice(0, 10) ??
      "";
    const status = availability.status as ListingStatus;
    const statusReason = typeof availability.statusReason === "string"
      ? availability.statusReason
      : null;
    const applicationUrl =
      typeof urls.applicationUrl === "string" ? urls.applicationUrl : null;
    const deadline =
      typeof availability.closesAt === "string" ? availability.closesAt : null;
    const deadlineType =
      typeof availability.deadlineType === "string" ? availability.deadlineType : null;
    const applicationCycle =
      typeof availability.applicationCycle === "string" ? availability.applicationCycle : null;
    const global = typeof geography.global === "boolean" ? geography.global : null;
    const remote = typeof geography.remote === "boolean" ? geography.remote : null;
    const sponsorshipType = typeof sponsorship.sponsorshipType === "string"
      ? sponsorship.sponsorshipType
      : null;
    const sponsorshipDisclosure = typeof sponsorship.sponsorshipDisclosure === "string"
      ? sponsorship.sponsorshipDisclosure
      : null;
    const changeHistory = raw.changeHistory as Record<string, unknown>;
    const createdAt = typeof changeHistory?.createdAt === "string" ? changeHistory.createdAt : null;
    const updatedAt = typeof changeHistory?.updatedAt === "string" ? changeHistory.updatedAt : null;
    const editorialReviewState = deriveEditorialReviewState({
      schemaVersion: "2.0",
      reviewMethod,
      reviewState,
      reviewerReference,
      reviewedAt,
    });
    const verified = qualifiesAsVerified({
      editorialReviewState,
      status,
      evidenceUrls,
      claimsChecked,
      applicationUrl,
      deadline,
      deadlineType,
      global,
      remote,
      countries,
      nextReviewAt,
    });
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
      status,
      submissionType: "community",
      sponsor: sponsorship.sponsored === true,
      reviewDate,
      regions: [...new Set(regions)],
      aliases: Array.isArray(raw.aliases) ? raw.aliases as string[] : [],
      resourceType: String(classification.resourceType),
      defaultSearchEligible: typeof classification.defaultSearchEligible === "boolean"
        ? classification.defaultSearchEligible
        : null,
      providerUrl: typeof urls.providerUrl === "string" ? urls.providerUrl : null,
      programUrl: typeof urls.programUrl === "string" ? urls.programUrl : null,
      applicationUrl,
      evidenceUrls,
      deadline,
      deadlineType,
      applicationCycle,
      global,
      remote,
      countries,
      physicalLocations,
      statusReason,
      reviewedAt,
      nextReviewAt,
      claimsChecked,
      sponsorshipType,
      sponsorshipDisclosure,
      createdAt,
      updatedAt,
      reviewMethod,
      reviewState,
      reviewerReference,
      editorialReviewState,
      verified,
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
    reviewMethod: null,
    reviewState: null,
    reviewerReference: null,
    editorialReviewState: "legacy-source-checked",
    verified: false,
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

export function deadlineLabel(
  listing: Pick<Listing, "deadline" | "deadlineType">,
): string {
  const date = listing.deadline?.slice(0, 10) ?? null;
  if (listing.deadlineType === "fixed")
    return date ? `Closes ${formatDate(date)}` : "Fixed deadline; date not structured";
  if (listing.deadlineType === "rolling") return "Rolling applications";
  if (listing.deadlineType === "periodic") return "Recurring application windows";
  if (listing.deadlineType === "none") return "No application deadline";
  if (date) return `Closes ${formatDate(date)}`;
  return "Deadline not structured";
}

export function statusLabel(status: ListingStatus): string {
  if (status === "archived") return "Inactive";
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
