export interface PublishedReviewListing {
  id: string;
  provider: string;
  title: string;
  category: string;
  status: string;
  reviewDate: string;
  reviewedAt: string | null;
  nextReviewAt: string | null;
  editorialReviewState: string;
  verified: boolean;
  programUrl: string;
  applicationUrl: string | null;
  deadline: string | null;
  deadlineType: string | null;
  canonicalUrl: string;
}

interface QueueResponse {
  total: number;
  count: number;
  nextCursor: string | null;
  listings: PublishedReviewListing[];
}

interface ControllerOptions {
  api<T>(path: string, init?: RequestInit): Promise<T>;
  onEdit(id: string): void;
  onVerify(id: string): void;
  onInactive(id: string): void;
  onRemove(id: string): void;
  onCount(total: number): void;
}

const required = <T extends HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing published-review element: ${selector}`);
  return node;
};

const visible = (node: HTMLElement, value: boolean) => {
  node.hidden = !value;
  node.classList.toggle("hidden", !value);
};

const displayDate = (value: string | null): string => {
  if (!value) return "Never human verified";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const deadlineSummary = (listing: PublishedReviewListing): string => {
  if (listing.deadlineType === "fixed")
    return listing.deadline
      ? `Deadline ${displayDate(listing.deadline)}`
      : "Fixed deadline missing date";
  if (listing.deadlineType === "rolling") return "Rolling applications";
  if (listing.deadlineType === "periodic") return "Recurring application windows";
  if (listing.deadlineType === "none") return "No application deadline";
  return "Deadline not structured";
};

const statusLabel = (value: string): string =>
  value === "archived"
    ? "Inactive"
    : value
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

export function createPublishedReviewController(options: ControllerOptions) {
  let listings: PublishedReviewListing[] = [];
  let cursor: string | null = null;

  const render = (total: number) => {
    const queueState = required<HTMLElement>("#queue-state");
    const view = required<HTMLElement>("#published-review-view");
    const list = required<HTMLElement>("#published-review-list");
    visible(queueState, false);
    visible(view, true);
    options.onCount(total);
    list.replaceChildren();

    for (const listing of listings) {
      const article = document.createElement("article");
      article.className =
        "rounded-md border border-line bg-surface p-4 sm:p-5";

      const top = document.createElement("div");
      top.className = "flex flex-wrap items-start justify-between gap-3";
      const identity = document.createElement("div");
      identity.className = "min-w-0";
      const provider = document.createElement("p");
      provider.className = "text-sm font-medium text-muted";
      provider.textContent = listing.provider;
      const title = document.createElement("h3");
      title.className = "mt-1 text-lg font-semibold";
      title.textContent = listing.title;
      identity.append(provider, title);

      const badge = document.createElement("span");
      badge.className =
        "shrink-0 rounded bg-soft px-2 py-1 text-xs font-semibold";
      badge.textContent = statusLabel(listing.status);
      top.append(identity, badge);

      const facts = document.createElement("div");
      facts.className =
        "mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted";
      const review = document.createElement("span");
      review.textContent = listing.reviewedAt
        ? `Last human verification ${displayDate(listing.reviewedAt)}`
        : "Never human verified";
      const next = document.createElement("span");
      next.textContent = listing.nextReviewAt
        ? `Next review ${displayDate(listing.nextReviewAt)}`
        : "No next-review date";
      const state = document.createElement("span");
      state.textContent = listing.verified
        ? "Meets strict Verified rules"
        : listing.editorialReviewState.replaceAll("-", " ");
      const application = document.createElement("span");
      application.textContent = listing.applicationUrl
        ? "Application page linked"
        : "Application page not structured";
      const deadline = document.createElement("span");
      deadline.textContent = deadlineSummary(listing);
      facts.append(review, next, state, application, deadline);

      const sourceLinks = document.createElement("div");
      sourceLinks.className = "mt-4 flex flex-wrap gap-2 text-sm";
      const program = document.createElement("a");
      program.href = listing.programUrl;
      program.target = "_blank";
      program.rel = "noopener noreferrer";
      program.className =
        "inline-flex min-h-10 items-center rounded-md border border-line px-3 font-medium no-underline";
      program.textContent = "Check program link";
      sourceLinks.append(program);
      if (listing.applicationUrl) {
        const application = document.createElement("a");
        application.href = listing.applicationUrl;
        application.target = "_blank";
        application.rel = "noopener noreferrer";
        application.className = program.className;
        application.textContent = "Check application link";
        sourceLinks.append(application);
      }
      const publicListing = document.createElement("a");
      publicListing.href = listing.canonicalUrl;
      publicListing.target = "_blank";
      publicListing.rel = "noopener noreferrer";
      publicListing.className = program.className;
      publicListing.textContent = "Open listing";
      sourceLinks.append(publicListing);

      const actions = document.createElement("div");
      actions.className =
        "mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-4";
      const actionButton = (label: string, className: string, handler: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `min-h-11 rounded-md px-3 text-sm font-semibold ${className}`;
        button.textContent = label;
        button.addEventListener("click", handler);
        return button;
      };
      actions.append(
        actionButton("Quick edit", "border border-line", () => options.onEdit(listing.id)),
        actionButton("Verify current", "bg-green-700 text-white", () => options.onVerify(listing.id)),
        actionButton("Mark inactive", "border border-amber-300 text-amber-900", () => options.onInactive(listing.id)),
        actionButton("Remove", "border border-red-300 text-red-700", () => options.onRemove(listing.id)),
      );

      article.append(top, facts, sourceLinks, actions);
      list.append(article);
    }

    if (!listings.length) {
      queueState.textContent = "No published listings match the current filters.";
      visible(queueState, true);
      visible(view, false);
    }
    visible(required<HTMLButtonElement>("#load-more-published-review"), Boolean(cursor));
  };

  const load = async (category: string, search: string, append = false) => {
    const cursorParameter =
      append && cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const result = await options.api<QueueResponse>(
      `/api/moderation/listings/review?limit=25${
        category ? `&category=${encodeURIComponent(category)}` : ""
      }${search ? `&search=${encodeURIComponent(search)}` : ""}${cursorParameter}`,
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
