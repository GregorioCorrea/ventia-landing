import { createHash } from "crypto";
import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { EnvValidationError, getEnv, getOpenAiEnv } from "../lib/env";
import { getHistorySummaryByDebtorId } from "../lib/history";
import { logError, logInfo } from "../lib/logger";
import { generateMessage } from "../lib/openai";
import { calculatePriority } from "../lib/priority";
import { getQueryParam, getRouteParam, parseJsonBody } from "../lib/request";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";
import { getDebtorOrThrow } from "../lib/debtor-service";
import { buildAddressee } from "../lib/addressee";
import { getBusinessSettings } from "../lib/business-settings";

type Tone = "amable" | "directo" | "ultimo";
const ALLOWED_TONES: Tone[] = ["amable", "directo", "ultimo"];

type MessageRequest = {
  tone?: Tone;
  regenerate?: boolean;
};

type LastSentEvent = {
  created_at: string;
  payload: {
    message_text?: string;
    tone?: string;
  } | null;
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout_after_${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 24);
}

function buildReasonLine(args: {
  tone: Tone;
  daysOverdue: number;
  noResponseCount: number;
  softTreatment: boolean;
  addresseeType: "person" | "entity";
}): string {
  const parts: string[] = [
    `tono ${args.tone}`,
    `${args.daysOverdue} dias`,
    args.addresseeType === "entity" ? "destinatario entidad" : "destinatario persona"
  ];
  if (args.noResponseCount > 0) {
    parts.push(`ignoro ${args.noResponseCount} veces`);
  }
  if (args.softTreatment) {
    parts.push("suavizado por relacion comercial");
  }
  return parts.join(" / ");
}

function paymentInstruction(method: string, details: string, callout: string): string {
  const detail = details?.trim();
  const intro = callout?.trim() || "Te paso el medio de pago para resolverlo rapido.";
  if (!detail) {
    return intro;
  }

  if (method === "cbu") {
    return `${intro} CBU: ${detail}.`;
  }
  if (method === "mp") {
    return `${intro} Mercado Pago: ${detail}.`;
  }
  if (method === "custom") {
    return `${intro} ${detail}.`;
  }
  return `${intro} Alias: ${detail}.`;
}

function buildPrompt(args: {
  variationId: string;
  tone: Tone;
  debtorName: string;
  amountArs: number;
  daysOverdue: number;
  debtorNote: string | null;
  settings: {
    sender_name: string;
    sender_role: string;
    greeting_style: string;
    pronoun: "vos" | "usted";
    signature: string;
    payment_method: string;
    payment_details: string;
    payment_callout: string;
    entity_greeting_rule: string;
    style_notes: string;
  };
  history: {
    no_response: number;
    promise: number;
    paid: number;
    replied: number;
    sent: number;
  };
  addressee: {
    addressee_type: "person" | "entity";
    addressee_line: string;
  };
  lastSentText: string;
  softTreatment: boolean;
}): string {
  const amount = `$${Math.round(args.amountArs).toLocaleString("es-AR")}`;
  const payment = paymentInstruction(
    args.settings.payment_method,
    args.settings.payment_details,
    args.settings.payment_callout
  );

  return `
variation_id: ${args.variationId}
Genera UN mensaje de WhatsApp para cobranza, en espanol rioplatense.
Limites: maximo 280 caracteres, ideal 180-220.

Contexto:
- Remitente: ${args.settings.sender_name} (${args.settings.sender_role})
- Firma: ${args.settings.signature}
- Saludo sugerido: ${args.addressee.addressee_line}
- Destinatario tipo: ${args.addressee.addressee_type}
- Deudor: ${args.debtorName}
- Monto: ${amount}
- Dias vencido: ${args.daysOverdue}
- Nota: ${args.debtorNote || "sin nota"}
- Historial: sent=${args.history.sent}, no_response=${args.history.no_response}, promise=${args.history.promise}, paid=${args.history.paid}, replied=${args.history.replied}
- Pronombre requerido: ${args.settings.pronoun}
- Tono solicitado: ${args.tone}
- Metodo de cobro: ${payment}
- Rule entidades: ${args.settings.entity_greeting_rule}
- Notas de estilo: ${args.settings.style_notes}
- Ultimo mensaje enviado: ${args.lastSentText || "(ninguno)"}

Reglas obligatorias:
1) No repetir literalmente el ultimo mensaje enviado ni el mismo cierre.
2) Incluir monto y CTA con dos opciones: "pagas hoy" o "coordinamos fecha".
3) Si destinatario es entidad: no saludar como nombre propio; pedir administracion/cuentas a pagar.
4) Si tono es ultimo: consecuencia suave (cuenta corriente / entregas), sin amenazas.
5) Incluir metodo de cobro de forma natural.
6) Cerrar con firma.

Responde solo con el mensaje final.
`.trim();
}

function buildFallbackMessage(args: {
  addresseeLine: string;
  amountArs: number;
  daysOverdue: number;
  tone: Tone;
  paymentLine: string;
  signature: string;
  addresseeType: "person" | "entity";
}): string {
  const amount = `$${Math.round(args.amountArs).toLocaleString("es-AR")}`;
  const base = `${args.addresseeLine}. Te escribo por saldo pendiente ${amount} (${args.daysOverdue} dias).`;
  const cta = "Te sirve si pagas hoy o coordinamos fecha?";
  const entityAsk =
    args.addresseeType === "entity" ? "Si no sos el area correcta, me pasas con administracion/cuentas a pagar?" : "";
  const lastTone =
    args.tone === "ultimo"
      ? "Para evitar frenar la cuenta corriente y seguir entregando normal."
      : "";

  return clampMessage(`${base} ${cta} ${args.paymentLine} ${entityAsk} ${lastTone} ${args.signature}`.trim());
}

async function getLastSentEvent(supabase: ReturnType<typeof getSupabaseClient>, debtorId: string) {
  const { data, error } = await supabase
    .from("debtor_event")
    .select("created_at, payload")
    .eq("debtor_id", debtorId)
    .eq("type", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to read last sent event.", "last_sent_read_failed");
  }
  return data as LastSentEvent | null;
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
    const variationId = `${Date.now()}-${Math.round(Math.random() * 10000)}`;
    let modelName = "local-fallback";
    let openAiReady = false;

    try {
      const openAiEnv = getOpenAiEnv();
      modelName = openAiEnv.AZURE_OPENAI_DEPLOYMENT_NAME;
      openAiReady = true;
    } catch (error) {
      if (!(error instanceof EnvValidationError)) {
        throw error;
      }
      logError(context, "OpenAI env not configured. Using fallback message mode.", error.missing);
    }

    const supabase = getSupabaseClient();
    const debtor = await getDebtorOrThrow(supabase, env.COBROSMART_BUSINESS_ID, debtorId);
    const settings = await getBusinessSettings(supabase, env.COBROSMART_BUSINESS_ID);

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
          model: cached.model || modelName,
          cached: true
        });
        return;
      }
    }

    const history = await getHistorySummaryByDebtorId(supabase, debtorId);
    const lastSent = await getLastSentEvent(supabase, debtorId);
    const priority = calculatePriority(
      {
        days_overdue: debtor.days_overdue,
        amount_ars: debtor.amount_ars,
        note: debtor.note
      },
      history
    );

    let addressee = await buildAddressee(debtor.name, settings, openAiReady);
    if (!openAiReady && addressee.source === "llm") {
      addressee = await buildAddressee(debtor.name, settings, false);
    }

    const prompt = buildPrompt({
      variationId,
      tone,
      debtorName: debtor.name,
      amountArs: debtor.amount_ars,
      daysOverdue: debtor.days_overdue,
      debtorNote: debtor.note,
      settings,
      history,
      addressee,
      lastSentText: lastSent?.payload?.message_text || "",
      softTreatment: priority.soft_treatment
    });

    const reason = buildReasonLine({
      tone,
      daysOverdue: debtor.days_overdue,
      noResponseCount: history.no_response,
      softTreatment: priority.soft_treatment,
      addresseeType: addressee.addressee_type
    });

    const paymentLine = paymentInstruction(
      settings.payment_method,
      settings.payment_details,
      settings.payment_callout
    );

    let messageText: string;
    let finalReason = reason;
    let usedFallback = false;

    try {
      if (!openAiReady) {
        throw new Error("openai_not_configured");
      }
      const rawMessage = await withTimeout(
        generateMessage(prompt, {
          temperature: regenerate ? 0.7 : 0.3,
          top_p: regenerate ? 0.95 : 0.9,
          max_tokens: 220
        }),
        25000
      );
      messageText = clampMessage(rawMessage);
    } catch (generationError) {
      usedFallback = true;
      logError(context, "OpenAI generation failed, using fallback message.", generationError);
      messageText = buildFallbackMessage({
        addresseeLine: addressee.addressee_line,
        amountArs: debtor.amount_ars,
        daysOverdue: debtor.days_overdue,
        tone,
        paymentLine,
        signature: settings.signature,
        addresseeType: addressee.addressee_type
      });
      finalReason = `${reason} / fallback local`;
    }

    const computedPromptHash = promptHash(prompt);
    const nowIso = new Date().toISOString();

    const { error: cacheWriteError } = await supabase.from("message_cache").upsert(
      {
        debtor_id: debtorId,
        tone,
        message_text: messageText,
        message_reason: finalReason,
        model: modelName,
        created_at: nowIso,
        updated_at: nowIso,
        last_variation_id: variationId,
        last_prompt_hash: computedPromptHash
      },
      { onConflict: "debtor_id,tone" }
    );

    if (cacheWriteError) {
      throw new HttpError(500, "Failed to write message cache.", "cache_write_failed");
    }

    logInfo(context, "Debtor message generated", {
      debtorId,
      tone,
      regenerate,
      fallback: usedFallback,
      addresseeType: addressee.addressee_type
    });

    context.res = jsonResponse(200, {
      message_text: messageText,
      reason: finalReason,
      model: modelName,
      cached: false,
      fallback: usedFallback,
      addressee_type: addressee.addressee_type
    });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
