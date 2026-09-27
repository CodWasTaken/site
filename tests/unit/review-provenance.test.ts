import assert from "node:assert/strict";
import test from "node:test";
import { normalizeListingRecord } from "../../src/lib/listings.ts";

const baseV2 = (): Record<string, unknown> => ({
  id: "example-grant",
  schemaVersion: "2.0",
  provider: "Example Foundation",
  title: "Example Grant",
  aliases: [],
  description: "Funding for public-interest maintainers with a documented application process.",
  canonicalUrl: "https://example.org/grant",
  urls: {
    providerUrl: "https://example.org/",
    programUrl: "https://example.org/grant",
    applicationUrl: "https://example.org/grant/apply",
    evidenceUrls: [
      {
        type: "overview",
        url: "https://example.org/grant",
        checkedAt: "2026-09-20T10:00:00Z",
        claim: "Program existence and overview",
      },
    ],
  },
  classification: {
    resourceType: "funding",
    primaryCategory: "funding",
    subcategories: ["research-funding"],
    topics: ["open-source"],
    reviewState: "needs-human-review",
    defaultSearchEligible: true,
  },
  geography: {
    global: false,
    remote: true,
    countries: ["PL"],
    physicalLocations: [],
  },
  availability: {
    status: "open",
    closesAt: "2026-12-01",
    deadlineType: "fixed",
  },
  costAndBenefit: { benefitSummary: "Up to $10,000 in funding." },
  eligibility: { summary: "Eligible maintainers may apply." },
  reviewProvenance: {
    reviewedAt: null,
    reviewMethod: "automated-source-research",
    reviewerReference: "automation:availability-research-v1",
    claimsChecked: ["automated-source-access", "automated-program-page-match"],
    nextReviewAt: null,
    sourceFetchedAt: "2026-09-20T10:00:00Z",
  },
  sponsorship: { sponsored: false },
});

test("automated source research stays pending human review", () => {
  const listing = normalizeListingRecord(baseV2(), "automated.json");
  assert.equal(listing.reviewMethod, "automated-source-research");
  assert.equal(listing.reviewState, "needs-human-review");
  assert.equal(listing.editorialReviewState, "automated-research-pending-human-review");
  assert.equal(listing.verified, false);
  assert.equal(listing.reviewedAt, null);
  assert.equal(listing.reviewDate, "2026-09-20");
  assert.notEqual(listing.reviewDate, "1970-01-01");
});

test("human-reviewed v2 records can satisfy strict verification", () => {
  const raw = baseV2();
  const classification = raw.classification as Record<string, unknown>;
  const provenance = raw.reviewProvenance as Record<string, unknown>;
  classification.reviewState = "published";
  provenance.reviewedAt = "2026-09-21T11:00:00Z";
  provenance.reviewMethod = "human";
  provenance.reviewerReference = "role:moderator";
  provenance.claimsChecked = [
    "program-exists",
    "eligibility",
    "application-url",
    "deadline",
    "geography",
  ];
  provenance.nextReviewAt = "2026-12-15T00:00:00Z";

  const listing = normalizeListingRecord(raw, "human.json");
  assert.equal(listing.editorialReviewState, "human-reviewed");
  assert.equal(listing.verified, true);
  assert.equal(listing.reviewDate, "2026-09-21");
});

test("schema v2 alone never implies human review or verification", () => {
  const raw = baseV2();
  const classification = raw.classification as Record<string, unknown>;
  const provenance = raw.reviewProvenance as Record<string, unknown>;
  classification.reviewState = "unreviewed";
  provenance.reviewMethod = "legacy-record-migration";
  provenance.sourceFetchedAt = null;
  const listing = normalizeListingRecord(raw, "unreviewed.json");
  assert.equal(listing.editorialReviewState, "unconfirmed");
  assert.equal(listing.verified, false);
});

test("legacy v1 records are labeled as legacy source checks", () => {
  const listing = normalizeListingRecord({
    id: "legacy-grant",
    provider: "Legacy Foundation",
    title: "Legacy Grant",
    category: "funding",
    subcategories: [],
    tags: [],
    description: "A legacy record with overview evidence.",
    eligibility: "See provider terms.",
    value: "Funding.",
    sourceUrl: "https://example.org/legacy",
    officialUrl: "https://example.org/legacy",
    status: "active",
    submissionType: "maintainer",
    sponsor: false,
    reviewDate: "2026-01-02",
  }, "legacy.json");
  assert.equal(listing.editorialReviewState, "legacy-source-checked");
  assert.equal(listing.verified, false);
});
