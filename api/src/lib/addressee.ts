import { generateMessage } from "./openai";
import type { BusinessSettings } from "./business-settings";

export type AddresseeType = "person" | "entity";

export type AddresseeResult = {
  addressee_type: AddresseeType;
  addressee_line: string;
  source: "heuristic" | "llm";
};

const ENTITY_KEYWORDS = [
  "coop",
  "cooperativa",
  "sa",
  "srl",
  "s.a.",
  "s.r.l.",
  "constructora",
  "municipalidad",
  "taller",
  "ferreteria",
  "inmobiliaria",
  "servicios",
  "obras",
  "transporte",
  "estudio"
];

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function firstNameFromName(name: string): string {
  const token = name.trim().split(/\s+/)[0] || "che";
  return token.replace(/[^\p{L}\-]/gu, "") || "che";
}

function isPersonLike(name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }
  return parts.every((p) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]+$/.test(p));
}

function heuristicType(name: string): AddresseeType | "unknown" {
  const normalized = normalizeText(name);
  const hasEntityKeyword = ENTITY_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (hasEntityKeyword) {
    return "entity";
  }

  const hasDoubtMarkers = /["'()/]|[A-Z]{2,}|[.&]/.test(name);
  if (hasDoubtMarkers) {
    return "unknown";
  }

  if (isPersonLike(name)) {
    return "person";
  }
  return "unknown";
}

async function classifyWithLlm(name: string): Promise<AddresseeType> {
  const prompt = `
Clasifica si el destinatario es persona o entidad.
Nombre: "${name}"
Responde SOLO una palabra: person o entity.
`.trim();
  const response = (await generateMessage(prompt, { temperature: 0, top_p: 1, max_tokens: 5 }))
    .toLowerCase()
    .trim();
  return response.includes("entity") ? "entity" : "person";
}

function addresseeLine(type: AddresseeType, name: string, settings: BusinessSettings): string {
  const greeting = settings.greeting_style || "Hola";
  if (type === "person") {
    return `${greeting} ${firstNameFromName(name)}`;
  }

  if (/admin|cuentas/i.test(settings.entity_greeting_rule || "")) {
    return `${greeting}, con administracion o cuentas a pagar?`;
  }
  return `${greeting}, como estan? Les escribo de ${settings.sender_role}.`;
}

export async function buildAddressee(
  debtorName: string,
  settings: BusinessSettings,
  allowLlm = true
): Promise<AddresseeResult> {
  const heuristic = heuristicType(debtorName);
  if (heuristic !== "unknown") {
    return {
      addressee_type: heuristic,
      addressee_line: addresseeLine(heuristic, debtorName, settings),
      source: "heuristic"
    };
  }

  if (!allowLlm) {
    return {
      addressee_type: "entity",
      addressee_line: addresseeLine("entity", debtorName, settings),
      source: "heuristic"
    };
  }

  const classified = await classifyWithLlm(debtorName);
  return {
    addressee_type: classified,
    addressee_line: addresseeLine(classified, debtorName, settings),
    source: "llm"
  };
}
