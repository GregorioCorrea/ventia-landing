export type HistorySummary = {
  sent: number;
  no_response: number;
  promise: number;
  paid: number;
  replied: number;
};

export type PriorityInput = {
  days_overdue: number;
  amount_ars: number;
  note?: string | null;
};

export type PriorityResult = {
  priority_score: number;
  priority_reason: string;
  soft_treatment: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isVip(note?: string | null): boolean {
  if (!note) {
    return false;
  }
  return /vip/i.test(note);
}

function amountInThousands(amountArs: number): number {
  return Math.max(1, Math.round(amountArs / 1000));
}

export function emptyHistorySummary(): HistorySummary {
  return {
    sent: 0,
    no_response: 0,
    promise: 0,
    paid: 0,
    replied: 0
  };
}

export function calculatePriority(
  debtor: PriorityInput,
  historySummary: HistorySummary
): PriorityResult {
  const days = Math.max(0, debtor.days_overdue || 0);
  const amount = Math.max(0, debtor.amount_ars || 0);
  const vip = isVip(debtor.note);
  const paidBefore = historySummary.paid > 0;
  const softTreatment = vip || paidBefore;

  const daysScore = clamp(Math.log1p(days) / Math.log(121) * 58, 0, 58);
  const amountScore = clamp((Math.log10(Math.max(1, amount)) - 4) / 2 * 24, 0, 24);
  const historyScore = clamp(
    historySummary.no_response * 6 + historySummary.sent * 1 - historySummary.promise * 4 - historySummary.paid * 8,
    -20,
    28
  );
  const reputationAdjustment = softTreatment ? -10 : 0;

  const finalScore = clamp(Math.round(daysScore + amountScore + historyScore + reputationAdjustment), 0, 100);

  let historyLabel = "sin historial";
  if (historySummary.no_response > 0) {
    historyLabel = `ignoro ${historySummary.no_response} veces`;
  } else if (historySummary.promise > 0) {
    historyLabel = `prometio ${historySummary.promise} veces`;
  } else if (historySummary.paid > 0) {
    historyLabel = "ya pago antes";
  } else if (historySummary.replied > 0) {
    historyLabel = `respondio ${historySummary.replied} veces`;
  }

  let reason = `+${days} dias / $${amountInThousands(amount)}k / ${historyLabel}`;
  if (softTreatment) {
    reason += vip ? " / VIP" : " / buen historial";
  }

  return {
    priority_score: finalScore,
    priority_reason: reason,
    soft_treatment: softTreatment
  };
}
