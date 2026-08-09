import { RequestError } from "./http";
import { SupabaseError, supabaseRequest } from "./supabase";
import type { Env } from "./types";

const listingId = (value: string): string => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    throw new RequestError("Listing ID is invalid.", 400, "validation_failed");
  return value;
};

export async function isListingRemovedWithoutEdgeCache(
  env: Env,
  id: string,
): Promise<boolean> {
  const validId = listingId(id);
  try {
    const { data } = await supabaseRequest<Array<{ listing_id: string }>>(
      env,
      `/rest/v1/listing_moderation_state?listing_id=eq.${encodeURIComponent(validId)}&removed=eq.true&select=listing_id&limit=1`,
    );
    return Boolean(data[0]);
  } catch (error) {
    if (error instanceof SupabaseError) {
      console.warn(
        JSON.stringify({
          event: "listing_suppression_check_failed",
          status: error.status,
          database_code: error.databaseCode,
        }),
      );
      return false;
    }
    throw error;
  }
}
