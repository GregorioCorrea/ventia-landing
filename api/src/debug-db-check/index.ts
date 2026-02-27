import { HttpError, handleHttpError, jsonResponse } from "../lib/errors";
import { logInfo } from "../lib/logger";
import { getSupabaseClient } from "../lib/supabase";
import type { SimpleContext, SimpleHttpRequest } from "../lib/types";

export async function run(context: SimpleContext, req: SimpleHttpRequest): Promise<void> {
  try {
    if (req.method !== "GET") {
      context.res = jsonResponse(405, {
        ok: false,
        error: "method_not_allowed",
        message: "Only GET is allowed."
      });
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("business").select("id").limit(1);

    if (error) {
      throw new HttpError(500, "Supabase connectivity check failed.", "db_check_failed");
    }

    logInfo(context, "Supabase connectivity check passed");
    context.res = jsonResponse(200, { ok: true });
  } catch (error) {
    context.res = handleHttpError(context, error);
  }
}
