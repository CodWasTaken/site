import assert from "node:assert/strict";
import test from "node:test";
import { isDefaultOpportunity, type Listing } from "../../src/lib/listings";

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: "example",
  provider: "Example",
  title: "Example opportunity",
  category: "funding",
  subcategories: [],
  tags: [],
  description: "A sufficiently descriptive example.",
  eligibility: "A defined audience.",
  value: "Material support.",
  sourceUrl: "https://example.com/evidence",
  officialUrl: "https://example.com/program",
  status: "open",
  submissionType: "maintainer",
  sponsor: false,
  reviewDate: "2026-07-23",
  ...overrides,
});

test("default discovery excludes explicit scope decisions", () => {
  assert.equal(isDefaultOpportunity(listing()), true);
  assert.equal(
    isDefaultOpportunity(listing({ defaultSearchEligible: false })),
    false,
  );
});

test("default discovery excludes non-current editorial states", () => {
  for (const status of ["expired", "disputed", "archived"] as const) {
    assert.equal(isDefaultOpportunity(listing({ status })), false);
  }
});
