import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv } from "../lib/env";
import { logInfo } from "../lib/logger";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";

function getSortParam(req: SimpleHttpRequest): string | undefined {
  if (req.query?.sort) {
    return req.query.sort;
  }

  if (req.url) {
    try {
      const url = new URL(req.url);
      return url.searchParams.get("sort") || undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

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
      throw new HttpError(
        500,
        "Missing COBROSMART_BUSINESS_ID in server configuration.",
        "missing_business_id"
      );
    }

    const sort = getSortParam(req);
    const supabase = getSupabaseClient();
    let query = supabase
      .from("debtor")
      .select(
        "id, name, phone, amount_ars, days_overdue, note, last_status, last_contact_at, promise_date, priority_score, priority_reason"
      )
      .eq("business_id", env.COBROSMART_BUSINESS_ID);

    if (sort === "priority") {
      query = query.order("priority_score", { ascending: false, nullsFirst: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      throw new HttpError(500, "Failed to load debtors.", "debtors_query_failed");
    }

    logInfo(context, "Debtors loaded", { count: data?.length ?? 0, sort: sort || "created_at" });
    context.res = jsonResponse(200, { items: data ?? [] });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
