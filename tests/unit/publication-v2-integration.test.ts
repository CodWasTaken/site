import assert from "node:assert/strict";
import test from "node:test";
import { normalizeListingRecord } from "../../src/lib/listings.ts";
import {
  toPublishedOpportunity,
  type PublicationPayload,
} from "../../worker/lib/publication-data.ts";

const payload: PublicationPayload = {
  submission_id: "11111111-1111-4111-8111-111111111111",
  title: "Structured Grant",
  organization: "Commons Foundation",
  primary_category: "funding",
  subcategories: ["research-funding"],
  tags: ["open-source"],
  description: "A structured grant for public-interest maintainers.",
  eligibility: "Maintainers meeting the provider requirements may apply.",
  benefits: "Up to $10,000 in project funding.",
  resource_type: "funding",
  default_search_eligible: true,
  availability_status: "open",
  status_reason: "The application page is accepting submissions.",
  deadline_type: "fixed",
  deadline: "2026-12-01",
  global: false,
  remote: true,
  countries: ["PL", "DE"],
  physical_locations: [],
  provider_url: "https://example.org/",
  program_url: "https://example.org/grant",
  application_url: "https://example.org/grant/apply",
  sponsored: null,
  sponsorship_type: null,
  sponsorship_disclosure: null,
  claims_checked: ["program-exists", "eligibility", "application-url", "deadline", "geography"],
  next_review_at: "2027-01-15",
  normalized_at: "2026-07-22T18:00:00Z",
  review_method: "human",
  review_state: "published",
  reviewed_at: "2026-07-22T17:45:00Z",
  reviewer_reference: "role:moderator",
  source_fetched_at: null,
};

test("v2 publication survives the site display adapter without flattening semantics", () => {
  const published = toPublishedOpportunity(payload);
  const listing = normalizeListingRecord(
    JSON.parse(JSON.stringify(published)) as Record<string, unknown>,
    "generated-v2.json",
  );
  assert.equal(listing.schemaVersion, "2.0");
  assert.equal(listing.status, "open");
  assert.equal(listing.providerUrl, payload.provider_url);
  assert.equal(listing.programUrl, payload.program_url);
  assert.equal(listing.applicationUrl, payload.application_url);
  assert.equal(listing.officialUrl, payload.application_url);
  assert.equal(listing.deadline, payload.deadline);
  assert.equal(listing.deadlineType, "fixed");
  assert.deepEqual(listing.countries, ["PL", "DE"]);
  assert.deepEqual(listing.regions, ["PL", "DE", "Remote"]);
  assert.deepEqual(listing.claimsChecked, payload.claims_checked);
  assert.equal(listing.nextReviewAt, "2027-01-15");
  assert.equal(listing.editorialReviewState, "human-reviewed");
  assert.equal(listing.reviewedAt, "2026-07-22T17:45:00.000Z");
  assert.equal(listing.verified, true);
});

test("automated research remains pending human review through publication serialization", () => {
  const automated: PublicationPayload = {
    ...payload,
    review_method: "automated-source-research",
    review_state: "needs-human-review",
    reviewed_at: null,
    reviewer_reference: "automation:source-research-v1",
    source_fetched_at: "2026-07-22T16:30:00Z",
  };
  const published = toPublishedOpportunity(automated);
  const listing = normalizeListingRecord(
    JSON.parse(JSON.stringify(published)) as Record<string, unknown>,
    "automated-v2.json",
  );

  assert.equal(published.classification.reviewState, "needs-human-review");
  assert.equal(published.reviewProvenance.reviewMethod, "automated-source-research");
  assert.equal(published.reviewProvenance.reviewedAt, null);
  assert.equal(published.reviewProvenance.sourceFetchedAt, "2026-07-22T16:30:00.000Z");
  assert.equal(listing.editorialReviewState, "automated-research-pending-human-review");
  assert.equal(listing.verified, false);
});