export type AppEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_OPENAI_API_KEY: string;
  AZURE_OPENAI_DEPLOYMENT_NAME: string;
  AZURE_OPENAI_API_VERSION: string;
};

const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";

const requiredKeys: Array<keyof Omit<AppEnv, "AZURE_OPENAI_API_VERSION">> = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT_NAME"
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

  cachedEnv = result;
  return result;
}
