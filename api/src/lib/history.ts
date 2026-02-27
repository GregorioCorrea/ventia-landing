import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyHistorySummary, type HistorySummary } from "./priority";

type DebtorEventRow = {
  debtor_id: string;
  type: string;
};

function applyEvent(summary: HistorySummary, type: string): void {
  switch (type) {
    case "sent":
      summary.sent += 1;
      break;
    case "no_response":
      summary.no_response += 1;
      break;
    case "promise":
      summary.promise += 1;
      break;
    case "paid":
      summary.paid += 1;
      break;
    case "replied":
      summary.replied += 1;
      break;
    default:
      break;
  }
}

export async function getHistorySummaryByDebtorIds(
  supabase: SupabaseClient,
  debtorIds: string[]
): Promise<Map<string, HistorySummary>> {
  const map = new Map<string, HistorySummary>();

  for (const debtorId of debtorIds) {
    map.set(debtorId, emptyHistorySummary());
  }

  if (debtorIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("debtor_event")
    .select("debtor_id, type")
    .in("debtor_id", debtorIds);

  if (error) {
    throw error;
  }

  (data as DebtorEventRow[] | null)?.forEach((row) => {
    const summary = map.get(row.debtor_id);
    if (!summary) {
      return;
    }
    applyEvent(summary, row.type);
  });

  return map;
}

export async function getHistorySummaryByDebtorId(
  supabase: SupabaseClient,
  debtorId: string
): Promise<HistorySummary> {
  const result = await getHistorySummaryByDebtorIds(supabase, [debtorId]);
  return result.get(debtorId) || emptyHistorySummary();
}
