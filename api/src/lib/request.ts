import { HttpError } from "./errors";
import type { SimpleContext, SimpleHttpRequest } from "./types";

export function parseJsonBody<T>(body: unknown, errorCode = "invalid_json"): T {
  if (body === null || body === undefined) {
    throw new HttpError(400, "Body is required.", errorCode);
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new HttpError(400, "Body is not valid JSON.", errorCode);
    }
  }

  return body as T;
}

export function getRouteParam(
  req: SimpleHttpRequest,
  context: SimpleContext,
  key: string
): string | undefined {
  const reqValue = req.params?.[key];
  if (reqValue) {
    return reqValue;
  }

  const ctxValue = context.bindingData?.[key];
  if (typeof ctxValue === "string" && ctxValue.trim()) {
    return ctxValue.trim();
  }

  return undefined;
}

export function getQueryParam(req: SimpleHttpRequest, key: string): string | undefined {
  if (req.query?.[key]) {
    return req.query[key];
  }

  if (!req.url) {
    return undefined;
  }

  try {
    const url = new URL(req.url);
    return url.searchParams.get(key) || undefined;
  } catch {
    return undefined;
  }
}
