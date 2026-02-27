import { EnvValidationError } from "./env";
import { logError } from "./logger";
import type { SimpleContext, SimpleHttpResponse } from "./types";

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, message: string, code = "http_error") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(status: number, payload: Record<string, unknown>): SimpleHttpResponse {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

export function handleHttpError(context: SimpleContext, error: unknown): SimpleHttpResponse {
  if (error instanceof HttpError) {
    logError(context, `HTTP ${error.status} - ${error.code}: ${error.message}`);
    return jsonResponse(error.status, { ok: false, error: error.code, message: error.message });
  }

  if (error instanceof EnvValidationError) {
    logError(context, "Environment validation error", { missing: error.missing });
    return jsonResponse(500, {
      ok: false,
      error: "misconfigured_environment",
      message: "Server environment is not configured correctly."
    });
  }

  logError(context, "Unexpected error", error);
  return jsonResponse(500, {
    ok: false,
    error: "internal_server_error",
    message: "An unexpected error occurred."
  });
}
