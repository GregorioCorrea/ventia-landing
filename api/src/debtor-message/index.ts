import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { getEnv, getOpenAiEnv } from "../lib/env";
import { getHistorySummaryByDebtorId } from "../lib/history";
import { logInfo } from "../lib/logger";
import { generateMessage } from "../lib/openai";
import { calculatePriority } from "../lib/priority";
import { getQueryParam, getRouteParam, parseJsonBody } from "../lib/request";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";
import { getDebtorOrThrow } from "../lib/debtor-service";

type Tone = "amable" | "directo" | "ultimo";
const ALLOWED_TONES: Tone[] = ["amable", "directo", "ultimo"];

type MessageRequest = {
  tone?: Tone;
  regenerate?: boolean;
};

function normalizeTone(raw: unknown): Tone {
  if (typeof raw === "string" && ALLOWED_TONES.includes(raw as Tone)) {
    return raw as Tone;
  }
  return "amable";
}

function normalizeRegenerate(raw: unknown): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    return raw.toLowerCase() === "true" || raw === "1";
  }
  return false;
}

function clampMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 280) {
    return clean;
  }
  return `${clean.slice(0, 277).trim()}...`;
}

function buildReasonLine(
  tone: Tone,
  daysOverdue: number,
  noResponseCount: number,
  softTreatment: boolean
): string {
  const parts: string[] = [`tono ${tone}`, `${daysOverdue} dias vencido`];
  if (noResponseCount > 0) {
    parts.push(`ignoro ${noResponseCount} veces`);
  }
  if (softTreatment) {
    parts.push("enfoque suave por relacion comercial");
  }
  return parts.join(" / ");
}

function buildPrompt(args: {
  name: string;
  amountArs: number;
  daysOverdue: number;
  tone: Tone;
  history: { no_response: number; promise: number; paid: number; replied: number };
  softTreatment: boolean;
}): string {
  const amount = `$${Math.round(args.amountArs).toLocaleString("es-AR")}`;
  const softLine = args.softTreatment
    ? "Cliente sensible (VIP o pago previo): usa tono conciliador y evita dureza."
    : "Mantene firmeza profesional sin amenazas.";
  const ultimoLine =
    args.tone === "ultimo"
      ? 'Inclui consecuencia suave: "para no cortar la cuenta corriente o seguir entregando".'
      : "No menciones cortes ni bloqueo.";

  return `
Genera UN mensaje de WhatsApp en espanol rioplatense, humano y claro.
Maximo 280 caracteres (ideal 180-220). Sin amenazas legales.

Contexto fijo:
- Negocio: Corralon El Puente
- Cliente: ${args.name}
- Monto pendiente: ${amount}
- Dias vencido: ${args.daysOverdue}
- Tono solicitado: ${args.tone}
- Historial: no_response=${args.history.no_response}, promise=${args.history.promise}, paid=${args.history.paid}, replied=${args.history.replied}

Requisitos obligatorios:
1) Saludo corto y natural.
2) Contexto de cuenta pendiente del corralon.
3) Incluir monto.
4) CTA con estas dos opciones: "pagas hoy" o "coordinamos fecha".
5) ${ultimoLine}
6) ${softLine}

Devuelve solo el texto final del mensaje, sin comillas ni explicaciones.
`.trim();
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

    const body = parseJsonBody<MessageRequest>(req.body ?? {}, "invalid_json");
    const tone = normalizeTone(body.tone);
    const regenerate = normalizeRegenerate(body.regenerate ?? getQueryParam(req, "regenerate"));
    const openAiEnv = getOpenAiEnv();

    const supabase = getSupabaseClient();
    const debtor = await getDebtorOrThrow(supabase, env.COBROSMART_BUSINESS_ID, debtorId);

    if (!regenerate) {
      const { data: cached, error: cacheError } = await supabase
        .from("message_cache")
        .select("message_text, message_reason, model, created_at")
        .eq("debtor_id", debtorId)
        .eq("tone", tone)
        .maybeSingle();

      if (cacheError) {
        throw new HttpError(500, "Failed to read message cache.", "cache_read_failed");
      }

      if (cached?.message_text) {
        context.res = jsonResponse(200, {
          message_text: cached.message_text,
          reason: cached.message_reason || "",
          model: cached.model || openAiEnv.AZURE_OPENAI_DEPLOYMENT_NAME,
          cached: true
        });
        return;
      }
    }

    const history = await getHistorySummaryByDebtorId(supabase, debtorId);
    const priority = calculatePriority(
      {
        days_overdue: debtor.days_overdue,
        amount_ars: debtor.amount_ars,
        note: debtor.note
      },
      history
    );

    const prompt = buildPrompt({
      name: debtor.name,
      amountArs: debtor.amount_ars,
      daysOverdue: debtor.days_overdue,
      tone,
      history,
      softTreatment: priority.soft_treatment
    });

    const rawMessage = await generateMessage(prompt);
    const messageText = clampMessage(rawMessage);
    const reason = buildReasonLine(
      tone,
      debtor.days_overdue,
      history.no_response,
      priority.soft_treatment
    );

    const { error: cacheWriteError } = await supabase.from("message_cache").upsert(
      {
        debtor_id: debtorId,
        tone,
        message_text: messageText,
        message_reason: reason,
        model: openAiEnv.AZURE_OPENAI_DEPLOYMENT_NAME,
        created_at: new Date().toISOString()
      },
      { onConflict: "debtor_id,tone" }
    );

    if (cacheWriteError) {
      throw new HttpError(500, "Failed to write message cache.", "cache_write_failed");
    }

    logInfo(context, "Debtor message generated", { debtorId, tone, regenerate });
    context.res = jsonResponse(200, {
      message_text: messageText,
      reason,
      model: openAiEnv.AZURE_OPENAI_DEPLOYMENT_NAME,
      cached: false
    });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
