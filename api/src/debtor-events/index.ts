import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv } from "../lib/env";
import { getRouteParam, getQueryParam } from "../lib/request";
import { logInfo } from "../lib/logger";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";
import { getDebtorOrThrow } from "../lib/debtor-service";

export async function run(context: SimpleContext, req: SimpleHttpRequest): Promise<void> {
  try {
    if (req.method !== "GET") {
      context.res = jsonResponse(405, {
        ok: false,
        error: "method_not_allowed",
        message: "Only GET is allowed."
      });
      return;
    }

    const env = getEnv();
    if (!env.COBROSMART_BUSINESS_ID) {
      throw new HttpError(500, "Missing COBROSMART_BUSINESS_ID.", "missing_business_id");
    }

    const debtorId = getRouteParam(req, context, "id");
    if (!debtorId) {
      throw new HttpError(400, "Missing debtor id in route.", "missing_debtor_id");
    }

    const limitRaw = getQueryParam(req, "limit");
    const limit = Math.max(1, Math.min(100, Number(limitRaw || "20")));

    const supabase = getSupabaseClient();
    await getDebtorOrThrow(supabase, env.COBROSMART_BUSINESS_ID, debtorId);

    const { data, error } = await supabase
      .from("debtor_event")
      .select("id, debtor_id, type, payload, created_at")
      .eq("debtor_id", debtorId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new HttpError(500, "Failed to load debtor events.", "events_query_failed");
    }

    logInfo(context, "Debtor events loaded", { debtorId, count: data?.length ?? 0 });
    context.res = jsonResponse(200, { items: data ?? [] });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
