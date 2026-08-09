import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const configuredSite = process.env.PUBLIC_SITE_URL?.trim();
const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const site =
  configuredSite ??
  (vercelProductionHost
    ? `https://${vercelProductionHost}`
    : "https://perkcommons-next-fork-dev.cod3eater.workers.dev");

export default defineConfig({
  site,
  output: "static",
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes("/moderate") && !page.includes("/moderator-login"),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
  build: { format: "directory" },
});