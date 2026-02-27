import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { logInfo } from "../lib/logger";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";

const DEFAULT_BUSINESS_NAME = "Corralón El Puente";
const DEFAULT_BUSINESS_LOCATION = "Azul, Buenos Aires";
const DEFAULT_BUSINESS_VERTICAL = "corralon";

export async function run(context: SimpleContext, req: SimpleHttpRequest): Promise<void> {
  try {
    if (req.method !== "POST") {
      context.res = jsonResponse(405, {
        ok: false,
        error: "method_not_allowed",
        message: "Only POST is allowed."
      });
      return;
    }

    // TODO: remove anonymous access and protect this endpoint with auth.
    const supabase = getSupabaseClient();
    const { data: existingBusiness, error: fetchError } = await supabase
      .from("business")
      .select("id")
      .eq("name", DEFAULT_BUSINESS_NAME)
      .eq("location", DEFAULT_BUSINESS_LOCATION)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new HttpError(500, "Failed to query business bootstrap state.", "bootstrap_query_failed");
    }

    if (existingBusiness?.id) {
      logInfo(context, "Bootstrap found existing business", { businessId: existingBusiness.id });
      context.res = jsonResponse(200, { business_id: existingBusiness.id });
      return;
    }

    const { data: createdBusiness, error: insertError } = await supabase
      .from("business")
      .insert({
        name: DEFAULT_BUSINESS_NAME,
        location: DEFAULT_BUSINESS_LOCATION,
        vertical: DEFAULT_BUSINESS_VERTICAL
      })
      .select("id")
      .single();

    if (insertError || !createdBusiness?.id) {
      throw new HttpError(500, "Failed to create default business.", "bootstrap_create_failed");
    }

    logInfo(context, "Bootstrap created default business", { businessId: createdBusiness.id });
    context.res = jsonResponse(200, { business_id: createdBusiness.id });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
