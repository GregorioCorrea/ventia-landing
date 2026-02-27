import { handleHttpError } from "../lib/errors";
import { logInfo } from "../lib/logger";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";

export async function run(context: SimpleContext, req: SimpleHttpRequest): Promise<void> {
  try {
    if (req.method !== "GET") {
      context.res = {
        status: 405,
        jsonBody: { ok: false, error: "method_not_allowed", message: "Only GET is allowed." }
      };
      return;
    }

    logInfo(context, "Health endpoint called");
    context.res = {
      status: 200,
      jsonBody: { ok: true, service: "cobrosmart-api" }
    };
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
