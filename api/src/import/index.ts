import {
  computePriority,
  normalizeImportRow,
  type ImportRowInput,
  type NormalizedRow
} from "../lib/debtor-utils";
import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv } from "../lib/env";
import { logInfo } from "../lib/logger";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";

type ImportErrorItem = {
  row: number;
  message: string;
};

type ExistingDebtor = {
  id: string;
  phone: string;
  last_status: string | null;
};

function getRowsFromBody(body: unknown): ImportRowInput[] {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new HttpError(400, "Body is not valid JSON.", "invalid_json");
    }
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { rows?: unknown }).rows)) {
    throw new HttpError(400, "Body must be JSON: { rows: [...] }", "invalid_payload");
  }
  return (parsed as { rows: ImportRowInput[] }).rows;
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
      throw new HttpError(
        500,
        "Missing COBROSMART_BUSINESS_ID in server configuration.",
        "missing_business_id"
      );
    }

    const rows = getRowsFromBody(req.body);
    const errors: ImportErrorItem[] = [];
    const validRows: Array<{ rowNumber: number; data: NormalizedRow }> = [];

    rows.forEach((row, index) => {
      const normalized = normalizeImportRow(row);
      if (typeof normalized === "string") {
        if (errors.length < 10) {
          errors.push({ row: index + 1, message: normalized });
        }
        return;
      }
      validRows.push({ rowNumber: index + 1, data: normalized });
    });

    const supabase = getSupabaseClient();
    const uniquePhones = Array.from(new Set(validRows.map((x) => x.data.phone)));
    const existingByPhone = new Map<string, ExistingDebtor>();

    if (uniquePhones.length > 0) {
      const { data: existingRows, error: existingError } = await supabase
        .from("debtor")
        .select("id, phone, last_status")
        .eq("business_id", env.COBROSMART_BUSINESS_ID)
        .in("phone", uniquePhones);

      if (existingError) {
        throw new HttpError(500, "Failed to read existing debtors.", "import_read_failed");
      }

      (existingRows ?? []).forEach((row) => {
        if (!existingByPhone.has(row.phone)) {
          existingByPhone.set(row.phone, row as ExistingDebtor);
        }
      });
    }

    let inserted = 0;
    let updated = 0;
    let rejected = rows.length - validRows.length;

    for (const row of validRows) {
      const existing = existingByPhone.get(row.data.phone);
      const currentStatus = existing?.last_status ?? "new";
      const priority = computePriority(row.data.daysOverdue, row.data.amountArs, currentStatus);

      if (existing) {
        const { error: updateError } = await supabase
          .from("debtor")
          .update({
            name: row.data.name,
            phone: row.data.phone,
            amount_ars: row.data.amountArs,
            days_overdue: row.data.daysOverdue,
            note: row.data.note,
            last_status: currentStatus,
            priority_score: priority.score,
            priority_reason: priority.reason,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);

        if (updateError) {
          rejected += 1;
          if (errors.length < 10) {
            errors.push({
              row: row.rowNumber,
              message: "no se pudo actualizar en base de datos"
            });
          }
          continue;
        }

        updated += 1;
        continue;
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from("debtor")
        .insert({
          business_id: env.COBROSMART_BUSINESS_ID,
          name: row.data.name,
          phone: row.data.phone,
          amount_ars: row.data.amountArs,
          days_overdue: row.data.daysOverdue,
          note: row.data.note,
          last_status: "new",
          priority_score: priority.score,
          priority_reason: priority.reason
        })
        .select("id, phone, last_status")
        .single();

      if (insertError || !insertedRow) {
        rejected += 1;
        if (errors.length < 10) {
          errors.push({
            row: row.rowNumber,
            message: "no se pudo insertar en base de datos"
          });
        }
        continue;
      }

      existingByPhone.set(insertedRow.phone, insertedRow as ExistingDebtor);
      inserted += 1;
    }

    logInfo(context, "Import completed", { inserted, updated, rejected, total: rows.length });
    context.res = jsonResponse(200, { inserted, updated, rejected, errors });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
