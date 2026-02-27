import {
  normalizeImportRow,
  type ImportRowInput,
  type NormalizedRow
} from "../lib/debtor-utils";
import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv } from "../lib/env";
import { getHistorySummaryByDebtorIds } from "../lib/history";
import { logInfo } from "../lib/logger";
import { calculatePriority } from "../lib/priority";
import { parseJsonBody } from "../lib/request";
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
  days_overdue: number;
  amount_ars: number;
  note: string | null;
};

function getRowsFromBody(body: unknown): ImportRowInput[] {
  const parsed = parseJsonBody<{ rows?: ImportRowInput[] }>(body, "invalid_json");
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
        .select("id, phone, last_status, days_overdue, amount_ars, note")
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

    const existingDebtorIds = Array.from(existingByPhone.values()).map((x) => x.id);
    const historyMap = await getHistorySummaryByDebtorIds(supabase, existingDebtorIds);

    let inserted = 0;
    let updated = 0;
    let rejected = rows.length - validRows.length;

    for (const row of validRows) {
      const existing = existingByPhone.get(row.data.phone);
      const currentStatus = existing?.last_status ?? "new";

      if (existing) {
        const historySummary = historyMap.get(existing.id) || {
          sent: 0,
          no_response: 0,
          promise: 0,
          paid: 0,
          replied: 0
        };
        const priority = calculatePriority(
          {
            days_overdue: row.data.daysOverdue,
            amount_ars: row.data.amountArs,
            note: row.data.note
          },
          historySummary
        );

        const { error: updateError } = await supabase
          .from("debtor")
          .update({
            name: row.data.name,
            phone: row.data.phone,
            amount_ars: row.data.amountArs,
            days_overdue: row.data.daysOverdue,
            note: row.data.note,
            last_status: currentStatus,
            priority_score: priority.priority_score,
            priority_reason: priority.priority_reason,
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

      const priority = calculatePriority(
        {
          days_overdue: row.data.daysOverdue,
          amount_ars: row.data.amountArs,
          note: row.data.note
        },
        {
          sent: 0,
          no_response: 0,
          promise: 0,
          paid: 0,
          replied: 0
        }
      );

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
          priority_score: priority.priority_score,
          priority_reason: priority.priority_reason
        })
        .select("id, phone, last_status, days_overdue, amount_ars, note")
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
