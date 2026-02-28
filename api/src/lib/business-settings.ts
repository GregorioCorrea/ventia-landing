import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./errors";

export type BusinessSettings = {
  business_id: string;
  sender_name: string;
  sender_role: string;
  greeting_style: string;
  pronoun: "vos" | "usted";
  signature: string;
  payment_method: "alias" | "cbu" | "mp" | "custom";
  payment_details: string;
  payment_callout: string;
  entity_greeting_rule: string;
  style_notes: string;
  updated_at: string;
};

export type BusinessSettingsInput = Partial<Omit<BusinessSettings, "business_id" | "updated_at">>;

export function defaultBusinessSettings(businessId: string): BusinessSettings {
  return {
    business_id: businessId,
    sender_name: "Tavo",
    sender_role: "Corralon El Puente",
    greeting_style: "Buen dia",
    pronoun: "vos",
    signature: "Tavo - El Puente",
    payment_method: "alias",
    payment_details: "",
    payment_callout: "Te paso alias para que te quede simple.",
    entity_greeting_rule: "si es empresa/coop/municipalidad: pedir administracion o cuentas a pagar",
    style_notes: "rioplatense, corto, sin amenaza, concreto",
    updated_at: new Date().toISOString()
  };
}

function normalizePronoun(value: string | undefined): "vos" | "usted" {
  return value === "usted" ? "usted" : "vos";
}

function normalizePaymentMethod(
  value: string | undefined
): "alias" | "cbu" | "mp" | "custom" {
  if (value === "cbu" || value === "mp" || value === "custom") {
    return value;
  }
  return "alias";
}

export function mergeBusinessSettings(
  current: BusinessSettings,
  patch: BusinessSettingsInput
): BusinessSettings {
  return {
    ...current,
    sender_name: patch.sender_name?.trim() || current.sender_name,
    sender_role: patch.sender_role?.trim() || current.sender_role,
    greeting_style: patch.greeting_style?.trim() || current.greeting_style,
    pronoun: normalizePronoun(patch.pronoun),
    signature: patch.signature?.trim() || current.signature,
    payment_method: normalizePaymentMethod(patch.payment_method),
    payment_details: patch.payment_details?.trim() ?? current.payment_details,
    payment_callout: patch.payment_callout?.trim() || current.payment_callout,
    entity_greeting_rule: patch.entity_greeting_rule?.trim() || current.entity_greeting_rule,
    style_notes: patch.style_notes?.trim() || current.style_notes,
    updated_at: new Date().toISOString()
  };
}

export async function getBusinessSettings(
  supabase: SupabaseClient,
  businessId: string
): Promise<BusinessSettings> {
  const { data, error } = await supabase
    .from("business_settings")
    .select(
      "business_id, sender_name, sender_role, greeting_style, pronoun, signature, payment_method, payment_details, payment_callout, entity_greeting_rule, style_notes, updated_at"
    )
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to read business settings.", "settings_read_failed");
  }
  if (!data) {
    return defaultBusinessSettings(businessId);
  }
  return mergeBusinessSettings(defaultBusinessSettings(businessId), data as BusinessSettingsInput);
}

export async function upsertBusinessSettings(
  supabase: SupabaseClient,
  businessId: string,
  input: BusinessSettingsInput
): Promise<BusinessSettings> {
  const current = await getBusinessSettings(supabase, businessId);
  const merged = mergeBusinessSettings(current, input);

  const { data, error } = await supabase
    .from("business_settings")
    .upsert(merged, { onConflict: "business_id" })
    .select(
      "business_id, sender_name, sender_role, greeting_style, pronoun, signature, payment_method, payment_details, payment_callout, entity_greeting_rule, style_notes, updated_at"
    )
    .single();

  if (error || !data) {
    throw new HttpError(500, "Failed to save business settings.", "settings_write_failed");
  }
  return data as BusinessSettings;
}
