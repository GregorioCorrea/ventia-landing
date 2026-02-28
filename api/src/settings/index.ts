import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv } from "../lib/env";
import { logInfo } from "../lib/logger";
import { parseJsonBody } from "../lib/request";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";
import {
  getBusinessSettings,
  type BusinessSettingsInput,
  upsertBusinessSettings
} from "../lib/business-settings";

export async function run(context: SimpleContext, req: SimpleHttpRequest): Promise<void> {
  try {
    const env = getEnv();
    if (!env.COBROSMART_BUSINESS_ID) {
      throw new HttpError(500, "Missing COBROSMART_BUSINESS_ID.", "missing_business_id");
    }

    const supabase = getSupabaseClient();

    if (req.method === "GET") {
      const settings = await getBusinessSettings(supabase, env.COBROSMART_BUSINESS_ID);
      context.res = jsonResponse(200, { item: settings });
      return;
    }

    if (req.method === "POST") {
      // TODO: protect settings endpoint with auth.
      const body = parseJsonBody<BusinessSettingsInput>(req.body ?? {}, "invalid_json");
      const saved = await upsertBusinessSettings(supabase, env.COBROSMART_BUSINESS_ID, body);
      logInfo(context, "Business settings updated", { businessId: env.COBROSMART_BUSINESS_ID });
      context.res = jsonResponse(200, { ok: true, item: saved });
      return;
    }

    context.res = jsonResponse(405, {
      ok: false,
      error: "method_not_allowed",
      message: "Only GET and POST are allowed."
    });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
