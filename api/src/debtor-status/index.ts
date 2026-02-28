import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv } from "../lib/env";
import { getRouteParam, parseJsonBody } from "../lib/request";
import { logInfo } from "../lib/logger";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";
import { getDebtorOrThrow, recalculateDebtorPriority } from "../lib/debtor-service";

type AllowedStatus = "sent" | "promise" | "paid" | "no_response" | "replied";

type StatusBody = {
  status?: AllowedStatus;
  promise_date?: string;
  message_text?: string;
  tone?: "amable" | "directo" | "ultimo";
  channel?: string;
};

const ALLOWED: AllowedStatus[] = ["sent", "promise", "paid", "no_response", "replied"];

function parsePromiseDate(raw?: string): string | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

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

    const env = getEnv();
    if (!env.COBROSMART_BUSINESS_ID) {
      throw new HttpError(500, "Missing COBROSMART_BUSINESS_ID.", "missing_business_id");
    }

    const debtorId = getRouteParam(req, context, "id");
    if (!debtorId) {
      throw new HttpError(400, "Missing debtor id in route.", "missing_debtor_id");
    }

    const body = parseJsonBody<StatusBody>(req.body, "invalid_json");
    if (!body.status || !ALLOWED.includes(body.status)) {
      throw new HttpError(400, "Status must be one of sent/promise/paid/no_response/replied.", "invalid_status");
    }

    const promiseDate = parsePromiseDate(body.promise_date);
    if (body.status === "promise" && !promiseDate) {
      throw new HttpError(400, "promise_date is required for status=promise.", "missing_promise_date");
    }

    const supabase = getSupabaseClient();
    const debtor = await getDebtorOrThrow(supabase, env.COBROSMART_BUSINESS_ID, debtorId);

    const now = new Date().toISOString();
    const eventPayload: Record<string, unknown> = {
      status: body.status,
      at: now
    };
    if (promiseDate) {
      eventPayload.promise_date = promiseDate;
    }
    if (body.message_text && body.message_text.trim()) {
      eventPayload.message_text = body.message_text.trim();
    }
    if (body.tone) {
      eventPayload.tone = body.tone;
    }
    eventPayload.channel = body.channel?.trim() || "whatsapp_manual";

    const { error: eventError } = await supabase.from("debtor_event").insert({
      debtor_id: debtor.id,
      type: body.status,
      payload: eventPayload
    });
    if (eventError) {
      throw new HttpError(500, "Failed to write debtor event.", "event_insert_failed");
    }

    const patch: Record<string, unknown> = {
      last_status: body.status,
      last_contact_at: now,
      updated_at: now
    };
    if (body.status === "promise") {
      patch.promise_date = promiseDate;
    }
    if (body.status === "paid") {
      patch.promise_date = null;
    }

    const mergedDebtor = {
      ...debtor,
      last_status: String(patch.last_status),
      last_contact_at: String(patch.last_contact_at),
      promise_date: (patch.promise_date as string | null | undefined) ?? debtor.promise_date
    };

    const priority = await recalculateDebtorPriority(supabase, mergedDebtor);
    patch.priority_score = priority.priority_score;
    patch.priority_reason = priority.priority_reason;

    const { data: updated, error: updateError } = await supabase
      .from("debtor")
      .update(patch)
      .eq("id", debtor.id)
      .eq("business_id", env.COBROSMART_BUSINESS_ID)
      .select(
        "id, name, phone, amount_ars, days_overdue, note, last_status, last_contact_at, promise_date, priority_score, priority_reason"
      )
      .single();

    if (updateError || !updated) {
      throw new HttpError(500, "Failed to update debtor status.", "status_update_failed");
    }

    logInfo(context, "Debtor status updated", { debtorId: debtor.id, status: body.status });
    context.res = jsonResponse(200, { ok: true, item: updated });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
