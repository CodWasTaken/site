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
});
