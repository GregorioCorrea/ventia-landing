export type ImportRowInput = {
  cliente_nombre?: unknown;
  telefono?: unknown;
  monto?: unknown;
  dias_vencido?: unknown;
  fecha_vencimiento?: unknown;
  obra?: unknown;
};

export type NormalizedRow = {
  name: string;
  phone: string;
  amountArs: number;
  daysOverdue: number;
  note: string | null;
};

export function normalizePhone(phoneRaw: unknown): string | null {
  if (typeof phoneRaw !== "string") {
    return null;
  }

  const trimmed = phoneRaw.trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s\-()]/g, "");
  const plusCount = (compact.match(/\+/g) || []).length;
  if (plusCount > 1 || (plusCount === 1 && !compact.startsWith("+"))) {
    return null;
  }

  const normalized = compact.replace(/[^\d+]/g, "");
  const core = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (!/^\d{8,15}$/.test(core)) {
    return null;
  }

  return normalized.startsWith("+") ? `+${core}` : core;
}

export function parseAmountArs(amountRaw: unknown): number | null {
  if (typeof amountRaw === "number" && Number.isFinite(amountRaw)) {
    const rounded = Math.round(amountRaw);
    return rounded > 0 ? rounded : null;
  }

  if (typeof amountRaw !== "string") {
    return null;
  }

  const cleaned = amountRaw.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.includes(",") && !cleaned.includes(".")
    ? cleaned.replace(",", ".")
    : cleaned.replace(/,/g, "");

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

export function parseDaysOverdue(daysRaw: unknown): number | null {
  if (typeof daysRaw === "number" && Number.isFinite(daysRaw)) {
    const n = Math.floor(daysRaw);
    return n >= 0 ? n : null;
  }

  if (typeof daysRaw === "string" && daysRaw.trim()) {
    const n = Number(daysRaw.trim());
    if (Number.isFinite(n)) {
      const normalized = Math.floor(n);
      return normalized >= 0 ? normalized : null;
    }
  }

  return null;
}

export function computePriority(
  daysOverdue: number,
  amountArs: number,
  lastStatus: string | null
): { score: number; reason: string } {
  const dayComponent = Math.min(daysOverdue * 3, 240);
  const amountComponent = Math.min(Math.round(amountArs / 50000) * 5, 80);
  const statusComponent = lastStatus === "ignored" ? 20 : lastStatus === "promised" ? -8 : 0;
  const score = dayComponent + amountComponent + statusComponent;

  const reasonParts: string[] = [];
  if (daysOverdue >= 45) {
    reasonParts.push("antiguedad alta");
  } else if (daysOverdue >= 20) {
    reasonParts.push("antiguedad media");
  } else {
    reasonParts.push("antiguedad baja");
  }

  if (amountArs >= 250000) {
    reasonParts.push("monto alto");
  } else if (amountArs >= 100000) {
    reasonParts.push("monto medio");
  }

  if (lastStatus === "ignored") {
    reasonParts.push("ignoro contacto previo");
  } else if (lastStatus === "promised") {
    reasonParts.push("ya prometio pago");
  } else {
    reasonParts.push("sin historial");
  }

  return {
    score,
    reason: reasonParts.join(" | ")
  };
}

export function normalizeImportRow(row: ImportRowInput): NormalizedRow | string {
  const name = typeof row.cliente_nombre === "string" ? row.cliente_nombre.trim() : "";
  if (!name) {
    return "cliente_nombre es obligatorio";
  }

  const phone = normalizePhone(row.telefono);
  if (!phone) {
    return "telefono invalido";
  }

  const amountArs = parseAmountArs(row.monto);
  if (!amountArs || amountArs <= 0) {
    return "monto debe ser mayor a 0";
  }

  const daysOverdue = parseDaysOverdue(row.dias_vencido);
  if (daysOverdue === null) {
    return "dias_vencido debe ser >= 0";
  }

  const note = typeof row.obra === "string" && row.obra.trim() ? row.obra.trim() : null;

  return {
    name,
    phone,
    amountArs,
    daysOverdue,
    note
  };
}
