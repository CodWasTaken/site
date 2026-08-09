import { normalizeIpAddress } from "./fingerprints";
import { normalizeCountryCode } from "./validation";

export const requestClientIp = (request: Request): string | null =>
  normalizeIpAddress(
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "",
  );

export const requestCountry = (request: Request): string | null =>
  normalizeCountryCode(
    request.headers.get("cf-ipcountry") ??
      request.headers.get("x-vercel-ip-country") ??
      null,
  );
