export type PublicationResourceType =
  | "opportunity" | "resource" | "benefit" | "program" | "event" | "funding"
  | "fellowship" | "competition" | "community" | "learning-resource"
  | "public-dataset" | "general-free-product";

export type PublicationStatus =
  | "open" | "rolling" | "upcoming" | "limited" | "waitlist"
  | "temporarily-unavailable" | "closed" | "expired" | "unconfirmed"
  | "disputed" | "archived";

export type PublicationDeadlineType = "fixed" | "rolling" | "periodic" | "unknown" | "none";

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
    reviewState: "published";
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
    reviewedAt: string;
    reviewMethod: "human";
    reviewerReference: "role:moderator";
    claimsChecked: string[];
    nextReviewAt: string | null;
    sourceFetchedAt: null;
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

export const toPublishedOpportunity = (
  payload: PublicationPayload,
): PublishedOpportunity => {
  const reviewedAt = new Date(payload.normalized_at).toISOString();
  const createdAt =
    payload.original_created_at &&
    !Number.isNaN(new Date(payload.original_created_at).valueOf())
      ? new Date(payload.original_created_at).toISOString()
      : reviewedAt;
  const applicationUrl = payload.application_url || null;
  const evidenceUrls: EvidenceUrl[] = [
    {
      type: "overview",
      url: payload.program_url,
      checkedAt: reviewedAt,
      claim: "Program existence and overview",
    },
  ];
  if (applicationUrl && applicationUrl !== payload.program_url)
    evidenceUrls.push({
      type: "application",
      url: applicationUrl,
      checkedAt: reviewedAt,
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
      reviewState: "published",
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
      reviewMethod: "human",
      reviewerReference: "role:moderator",
      claimsChecked: payload.claims_checked,
      nextReviewAt: payload.next_review_at,
      sourceFetchedAt: null,
      sourceHash: null,
      confidence: null,
      importSource: null,
      extractorVersion: null,
    },
    changeHistory: {
      createdAt,
      updatedAt: reviewedAt,
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
