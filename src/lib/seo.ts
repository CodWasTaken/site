export const canonicalUrl = (site: URL, pathname: string): URL =>
  new URL(pathname, site);

export const safeJsonLd = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export const baseStructuredData = (site: URL): unknown[] => {
  const origin = site.href.replace(/\/$/, "");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "PerkCommons",
      url: origin,
      logo: `${origin}/brand/mark.svg`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PerkCommons",
      url: origin,
      potentialAction: {
        "@type": "SearchAction",
        target: `${origin}/opportunities/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
};
