import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./errors";
import { getHistorySummaryByDebtorId } from "./history";
import { calculatePriority } from "./priority";

export type DebtorRow = {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  amount_ars: number;
  days_overdue: number;
  note: string | null;
  last_status: string | null;
  last_contact_at: string | null;
  promise_date: string | null;
  priority_score: number | null;
  priority_reason: string | null;
};

export async function getDebtorOrThrow(
  supabase: SupabaseClient,
  businessId: string,
  debtorId: string
): Promise<DebtorRow> {
  const { data, error } = await supabase
    .from("debtor")
    .select(
      "id, business_id, name, phone, amount_ars, days_overdue, note, last_status, last_contact_at, promise_date, priority_score, priority_reason"
    )
    .eq("id", debtorId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load debtor.", "debtor_query_failed");
  }
  if (!data) {
    throw new HttpError(404, "Debtor not found.", "debtor_not_found");
  }
  return data as DebtorRow;
}

export async function recalculateDebtorPriority(
  supabase: SupabaseClient,
  debtor: DebtorRow
): Promise<{ priority_score: number; priority_reason: string; soft_treatment: boolean }> {
  const history = await getHistorySummaryByDebtorId(supabase, debtor.id);
  return calculatePriority(
    {
      days_overdue: debtor.days_overdue,
      amount_ars: debtor.amount_ars,
      note: debtor.note
    },
    history
  );
}
