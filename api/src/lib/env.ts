export type AppEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_DEPLOYMENT_NAME?: string;
  AZURE_OPENAI_API_VERSION: string;
  COBROSMART_BUSINESS_ID?: string;
};

export type OpenAiEnv = {
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_API_KEY: string;
  AZURE_OPENAI_DEPLOYMENT_NAME: string;
  AZURE_OPENAI_API_VERSION: string;
};

const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";

const requiredKeys: Array<keyof Pick<AppEnv, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">> = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

let cachedEnv: AppEnv | null = null;

export class EnvValidationError extends Error {
  public readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.name = "EnvValidationError";
    this.missing = missing;
  }
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const missing: string[] = [];
  const result = {} as AppEnv;

  for (const key of requiredKeys) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missing.push(key);
      continue;
    }
    result[key] = value;
  }

  if (missing.length > 0) {
    throw new EnvValidationError(missing);
  }

  result.AZURE_OPENAI_API_VERSION =
    process.env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_AZURE_OPENAI_API_VERSION;
  result.AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT?.trim() || undefined;
  result.AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY?.trim() || undefined;
  result.AZURE_OPENAI_DEPLOYMENT_NAME =
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim() || undefined;
  result.COBROSMART_BUSINESS_ID = process.env.COBROSMART_BUSINESS_ID?.trim() || undefined;

  cachedEnv = result;
  return result;
}

export function getOpenAiEnv(): OpenAiEnv {
  const env = getEnv();
  const missing: string[] = [];

  if (!env.AZURE_OPENAI_ENDPOINT) {
    missing.push("AZURE_OPENAI_ENDPOINT");
  }
  if (!env.AZURE_OPENAI_API_KEY) {
    missing.push("AZURE_OPENAI_API_KEY");
  }
  if (!env.AZURE_OPENAI_DEPLOYMENT_NAME) {
    missing.push("AZURE_OPENAI_DEPLOYMENT_NAME");
  }

  if (missing.length > 0) {
    throw new EnvValidationError(missing);
  }

  return {
    AZURE_OPENAI_ENDPOINT: env.AZURE_OPENAI_ENDPOINT!,
    AZURE_OPENAI_API_KEY: env.AZURE_OPENAI_API_KEY!,
    AZURE_OPENAI_DEPLOYMENT_NAME: env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    AZURE_OPENAI_API_VERSION: env.AZURE_OPENAI_API_VERSION
  };
}
