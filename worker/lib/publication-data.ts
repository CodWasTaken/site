export type PublicationResourceType =
  | "opportunity" | "resource" | "benefit" | "program" | "event" | "funding"
  | "fellowship" | "competition" | "community" | "learning-resource"
  | "public-dataset" | "general-free-product";

export type PublicationStatus =
  | "open" | "rolling" | "upcoming" | "limited" | "waitlist"
  | "temporarily-unavailable" | "closed" | "expired" | "unconfirmed"
  | "disputed" | "archived";

export type PublicationDeadlineType = "fixed" | "rolling" | "periodic" | "unknown" | "none";

export type PublicationReviewMethod =
  | "human"
  | "human-assisted"
  | "automated-source-research"
  | "legacy-record-migration";

export type PublicationReviewState =
  | "published"
  | "human-reviewed"
  | "needs-human-review"
  | "automated-lint-passed"
  | "unreviewed";

export interface PublicationPayload {
  submission_id: string;
  target_listing_id?: string | null;
  original_created_at?: string | null;
  title: string;
  organization: string;
  primary_category: string;
  subcategories: string[];
  tags: string[];
  description: string;
  eligibility: string;
  benefits: string | null;
  resource_type: PublicationResourceType;
  default_search_eligible: boolean;
  availability_status: PublicationStatus;
  status_reason: string | null;
  deadline_type: PublicationDeadlineType;
  deadline: string | null;
  global: boolean | null;
  remote: boolean | null;
  countries: string[];
  physical_locations: string[];
  provider_url: string | null;
  program_url: string;
  application_url: string | null;
  sponsored: boolean | null;
  sponsorship_type: string | null;
  sponsorship_disclosure: string | null;
  claims_checked: string[];
  next_review_at: string | null;
  normalized_at: string;
  review_method: PublicationReviewMethod;
  review_state: PublicationReviewState;
  reviewed_at: string | null;
  reviewer_reference: string | null;
  source_fetched_at: string | null;
}

interface EvidenceUrl {
  type: "overview" | "application";
  url: string;
  checkedAt: string;
  claim: string;
}

export interface PublishedOpportunity {
  id: string;
  schemaVersion: "2.0";
  provider: string;
  title: string;
  aliases: string[];
  description: string;
  canonicalUrl: string;
  urls: {
    providerUrl: string | null;
    programUrl: string;
    applicationUrl: string | null;
    evidenceUrls: EvidenceUrl[];
  };
  classification: {
    resourceType: PublicationResourceType;
    primaryCategory: string;
    subcategories: string[];
    topics: string[];
    audiences: string[];
    organizationStages: string[];
    benefitTypes: [];
    reviewState: PublicationReviewState;
    defaultSearchEligible: boolean;
  };
  geography: {
    global: boolean | null;
    remote: boolean | null;
    countries: string[];
    excludedCountries: [];
    physicalLocations: string[];
    residencyRequired: null;
    languages: [];
  };
  availability: {
    status: PublicationStatus;
    statusReason: string | null;
    opensAt: null;
    closesAt: string | null;
    deadlineType: PublicationDeadlineType;
    applicationCycle: null;
    nextExpectedOpening: null;
  };
  costAndBenefit: {
    cost: null;
    benefits: [];
    currency: null;
    amount: null;
    maximumAmount: null;
    benefitSummary: string;
  };
  eligibility: {
    summary: string;
    studentLevels: [];
    organizationTypes: [];
    companyStages: [];
    ageRestrictions: null;
    incorporationRequired: null;
    nonprofitStatusRequired: null;
    openSourceRequired: null;
    researchAffiliationRequired: null;
  };
  reviewProvenance: {
    reviewedAt: string | null;
    reviewMethod: PublicationReviewMethod;
    reviewerReference: string | null;
    claimsChecked: string[];
    nextReviewAt: string | null;
    sourceFetchedAt: string | null;
    sourceHash: null;
    confidence: null;
    importSource: null;
    extractorVersion: null;
  };
  changeHistory: {
    createdAt: string;
    updatedAt: string;
    previousIds: [];
    supersedes: [];
    supersededBy: [];
    tombstone: false;
    removalReason: null;
  };
  sponsorship: {
    sponsored: boolean | null;
    sponsorshipType: string | null;
    sponsorshipDisclosure: string | null;
    featuredReason: null;
    featureExpiresAt: null;
  };
}

const clip = (value: string, maximum: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maximum) return normalized;
  const candidate = normalized.slice(0, maximum - 3);
  const wordBoundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, wordBoundary > maximum * 0.7 ? wordBoundary : undefined).trimEnd()}...`;
};

const slugPart = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const publicationListingId = (payload: PublicationPayload): string => {
  if (
    payload.target_listing_id &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.target_listing_id)
  )
    return payload.target_listing_id;
  const suffix = payload.submission_id.replaceAll("-", "").slice(0, 8);
  const base = slugPart(`${payload.organization}-${payload.title}`) || "opportunity";
  return `${base.slice(0, 71).replace(/-+$/g, "")}-${suffix}`;
};

export const publicationPayloadIssues = (payload: PublicationPayload): string[] => {
  const issues: string[] = [];
  if (
    payload.target_listing_id !== null &&
    payload.target_listing_id !== undefined &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.target_listing_id)
  )
    issues.push("target_listing_id");
  if (!RESOURCE_TYPES.has(payload.resource_type)) issues.push("resource_type");
  if (typeof payload.default_search_eligible !== "boolean") issues.push("default_search_eligible");
  if (!STATUSES.has(payload.availability_status)) issues.push("availability_status");
  if (!DEADLINE_TYPES.has(payload.deadline_type)) issues.push("deadline_type");
  if (payload.deadline_type === "fixed" && !payload.deadline) issues.push("deadline");
  try {
    const url = new URL(payload.program_url);
    if (url.protocol !== "https:") issues.push("program_url");
  } catch {
    issues.push("program_url");
  }
  if (!Array.isArray(payload.claims_checked) || payload.claims_checked.length === 0)
    issues.push("claims_checked");
  if (!payload.normalized_at || Number.isNaN(new Date(payload.normalized_at).valueOf()))
    issues.push("normalized_at");

  const humanMethod =
    payload.review_method === "human" || payload.review_method === "human-assisted";
  const humanState =
    payload.review_state === "published" || payload.review_state === "human-reviewed";
  const reviewedAtValid =
    Boolean(payload.reviewed_at) &&
    !Number.isNaN(new Date(payload.reviewed_at as string).valueOf());
  const publicReviewerReference =
    Boolean(payload.reviewer_reference) &&
    !payload.reviewer_reference!.startsWith("automation:");

  if (!REVIEW_METHODS.has(payload.review_method)) issues.push("review_method");
  if (!REVIEW_STATES.has(payload.review_state)) issues.push("review_state");
  if (!humanMethod || !humanState || !reviewedAtValid || !publicReviewerReference)
    issues.push("human_review_provenance");
  return [...new Set(issues)];
};

const RESOURCE_TYPES = new Set<unknown>([
  "opportunity", "resource", "benefit", "program", "event", "funding",
  "fellowship", "competition", "community", "learning-resource",
  "public-dataset", "general-free-product",
]);
const STATUSES = new Set<unknown>([
  "open", "rolling", "upcoming", "limited", "waitlist",
  "temporarily-unavailable", "closed", "expired", "unconfirmed",
  "disputed", "archived",
]);
const DEADLINE_TYPES = new Set<unknown>(["fixed", "rolling", "periodic", "unknown", "none"]);
const REVIEW_METHODS = new Set<unknown>([
  "human",
  "human-assisted",
  "automated-source-research",
  "legacy-record-migration",
]);
const REVIEW_STATES = new Set<unknown>([
  "published",
  "human-reviewed",
  "needs-human-review",
  "automated-lint-passed",
  "unreviewed",
]);

export const toPublishedOpportunity = (
  payload: PublicationPayload,
): PublishedOpportunity => {
  const normalizedAt = new Date(payload.normalized_at).toISOString();
  const reviewedAt =
    payload.reviewed_at && !Number.isNaN(new Date(payload.reviewed_at).valueOf())
      ? new Date(payload.reviewed_at).toISOString()
      : null;
  const sourceFetchedAt =
    payload.source_fetched_at &&
    !Number.isNaN(new Date(payload.source_fetched_at).valueOf())
      ? new Date(payload.source_fetched_at).toISOString()
      : null;
  const evidenceCheckedAt = sourceFetchedAt ?? reviewedAt ?? normalizedAt;
  const createdAt =
    payload.original_created_at &&
    !Number.isNaN(new Date(payload.original_created_at).valueOf())
      ? new Date(payload.original_created_at).toISOString()
      : normalizedAt;
  const applicationUrl = payload.application_url || null;
  const evidenceUrls: EvidenceUrl[] = [
    {
      type: "overview",
      url: payload.program_url,
      checkedAt: evidenceCheckedAt,
      claim: "Program existence and overview",
    },
  ];
  if (applicationUrl && applicationUrl !== payload.program_url)
    evidenceUrls.push({
      type: "application",
      url: applicationUrl,
      checkedAt: evidenceCheckedAt,
      claim: "Application destination",
    });
  const benefitSummary = clip(
    payload.benefits || "See the program source for current benefits.",
    2_000,
  );
  return {
    id: publicationListingId(payload),
    schemaVersion: "2.0",
    provider: clip(payload.organization, 140),
    title: clip(payload.title, 180),
    aliases: [],
    description: clip(payload.description, 3_000),
    canonicalUrl: payload.program_url,
    urls: {
      providerUrl: payload.provider_url,
      programUrl: payload.program_url,
      applicationUrl,
      evidenceUrls,
    },
    classification: {
      resourceType: payload.resource_type,
      primaryCategory: payload.primary_category,
      subcategories: payload.subcategories,
      topics: payload.tags,
      audiences: [],
      organizationStages: [],
      benefitTypes: [],
      reviewState: payload.review_state,
      defaultSearchEligible: payload.default_search_eligible,
    },
    geography: {
      global: payload.global,
      remote: payload.remote,
      countries: payload.countries,
      excludedCountries: [],
      physicalLocations: payload.physical_locations,
      residencyRequired: null,
      languages: [],
    },
    availability: {
      status: payload.availability_status,
      statusReason: payload.status_reason,
      opensAt: null,
      closesAt: payload.deadline,
      deadlineType: payload.deadline_type,
      applicationCycle: null,
      nextExpectedOpening: null,
    },
    costAndBenefit: {
      cost: null,
      benefits: [],
      currency: null,
      amount: null,
      maximumAmount: null,
      benefitSummary,
    },
    eligibility: {
      summary: clip(payload.eligibility, 3_000),
      studentLevels: [],
      organizationTypes: [],
      companyStages: [],
      ageRestrictions: null,
      incorporationRequired: null,
      nonprofitStatusRequired: null,
      openSourceRequired: null,
      researchAffiliationRequired: null,
    },
    reviewProvenance: {
      reviewedAt,
      reviewMethod: payload.review_method,
      reviewerReference: payload.reviewer_reference,
      claimsChecked: payload.claims_checked,
      nextReviewAt: payload.next_review_at,
      sourceFetchedAt,
      sourceHash: null,
      confidence: null,
      importSource: null,
      extractorVersion: null,
    },
    changeHistory: {
      createdAt,
      updatedAt: normalizedAt,
      previousIds: [],
      supersedes: [],
      supersededBy: [],
      tombstone: false,
      removalReason: null,
    },
    sponsorship: {
      sponsored: payload.sponsored,
      sponsorshipType: payload.sponsorship_type,
      sponsorshipDisclosure: payload.sponsorship_disclosure,
      featuredReason: null,
      featureExpiresAt: null,
    },
  };
};