import type { SimpleContext } from "./types";

function withInvocationId(context: SimpleContext | undefined, message: string): string {
  if (!context?.invocationId) {
    return message;
  }
  return `[${context.invocationId}] ${message}`;
}

export function logInfo(context: SimpleContext | undefined, message: string, data?: unknown): void {
  const formatted = withInvocationId(context, message);
  if (context?.log) {
    context.log(formatted, data ?? "");
    return;
  }
  console.log(formatted, data ?? "");
}

export function logError(context: SimpleContext | undefined, message: string, error?: unknown): void {
  const formatted = withInvocationId(context, message);
  if (context?.log?.error) {
    context.log.error(formatted, error ?? "");
    return;
  }
  console.error(formatted, error ?? "");
}
