export interface UnconfirmedListingSummary {
  id: string;
  provider: string;
  title: string;
  description: string;
  benefit: string;
  category: string;
  categoryLabel: string;
  status: "unconfirmed";
  reviewDate: string;
  resourceType: string;
  defaultSearchEligible: boolean | null;
  canonicalUrl: string;
  destinationUrl: string;
}

export interface CanonicalListing {
  id: string;
  provider: string;
  title: string;
  category: string;
  subcategories: string[];
  tags: string[];
  description: string;
  eligibility: string;
  value: string;
  sourceUrl: string;
  officialUrl: string;
  status: string;
  reviewDate: string;
  resourceType?: string;
  defaultSearchEligible?: boolean | null;
  providerUrl?: string | null;
  programUrl?: string | null;
  applicationUrl?: string | null;
  deadline?: string | null;
  deadlineType?: string | null;
  global?: boolean | null;
  remote?: boolean | null;
  countries?: string[];
  regions?: string[];
  reviewedAt?: string | null;
  nextReviewAt?: string | null;
  claimsChecked?: string[];
  sponsor?: boolean;
}

interface QueueResponse {
  total: number;
  count: number;
  nextCursor: string | null;
  listings: UnconfirmedListingSummary[];
}

interface ControllerOptions {
  api<T>(path: string, init?: RequestInit): Promise<T>;
  onEdit(id: string): void;
  onCount(total: number): void;
}

const required = <T extends HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing unconfirmed queue element: ${selector}`);
  return node;
};

const visible = (node: HTMLElement, value: boolean) => {
  node.hidden = !value;
  node.classList.toggle("hidden", !value);
};

export function createUnconfirmedQueueController(options: ControllerOptions) {
  let listings: UnconfirmedListingSummary[] = [];
  let cursor: string | null = null;

  const render = (total: number) => {
    const queueState = required<HTMLElement>("#queue-state");
    const view = required<HTMLElement>("#unconfirmed-view");
    const list = required<HTMLElement>("#unconfirmed-list");
    visible(queueState, false);
    visible(view, true);
    options.onCount(total);
    list.replaceChildren();
    for (const listing of listings) {
      const article = document.createElement("article");
      article.className =
        "rounded-md border border-line bg-surface p-4 sm:flex sm:items-start sm:justify-between sm:gap-5";
      const content = document.createElement("div");
      content.className = "min-w-0";
      const provider = document.createElement("p");
      provider.className = "text-sm font-medium text-muted";
      provider.textContent = listing.provider;
      const heading = document.createElement("h3");
      heading.className = "mt-1 text-lg font-semibold";
      heading.textContent = listing.title;
      const summary = document.createElement("p");
      summary.className = "mt-2 line-clamp-2 text-sm leading-6 text-muted";
      summary.textContent = listing.description;
      const facts = document.createElement("p");
      facts.className = "mt-3 text-xs text-muted";
      facts.textContent = [
        listing.categoryLabel,
        listing.resourceType.replaceAll("-", " "),
        `Source last checked ${listing.reviewDate}`,
        listing.defaultSearchEligible === false
          ? "Excluded from default search"
          : "Default-search candidate",
      ].join(" · ");
      content.append(provider, heading, summary, facts);

      const actions = document.createElement("div");
      actions.className = "mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0";
      const viewLink = document.createElement("a");
      viewLink.href = listing.canonicalUrl;
      viewLink.target = "_blank";
      viewLink.rel = "noopener noreferrer";
      viewLink.className =
        "inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm font-semibold no-underline";
      viewLink.textContent = "View listing";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className =
        "min-h-11 rounded-md bg-action px-4 text-sm font-semibold text-white";
      edit.textContent = "Review and edit";
      edit.addEventListener("click", () => options.onEdit(listing.id));
      actions.append(viewLink, edit);
      article.append(content, actions);
      list.append(article);
    }
    if (!listings.length) {
      queueState.textContent =
        "No unconfirmed listings match the current filters.";
      visible(queueState, true);
      visible(view, false);
    }
    visible(
      required<HTMLButtonElement>("#load-more-unconfirmed"),
      Boolean(cursor),
    );
  };

  const load = async (
    category: string,
    search: string,
    append = false,
  ) => {
    const cursorParameter =
      append && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const result = await options.api<QueueResponse>(
      `/api/moderation/listings/unconfirmed?limit=25${
        category ? `&category=${encodeURIComponent(category)}` : ""
      }${search ? `&search=${encodeURIComponent(search)}` : ""}${
        cursorParameter
      }`,
    );
    listings = append ? [...listings, ...result.listings] : result.listings;
    cursor = result.nextCursor;
    render(result.total);
  };

  return {
    load,
    reset() {
      listings = [];
      cursor = null;
    },
  };
}
