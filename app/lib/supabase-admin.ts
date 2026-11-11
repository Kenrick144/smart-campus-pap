import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Backwards-compatible server-only helper.
 * All privileged Supabase access now uses the single SUPABASE_SECRET_KEY
 * configuration, preventing routes from silently requiring the legacy
 * SUPABASE_SERVICE_ROLE_KEY variable.
 */
export function getSupabaseAdmin() {
  return createAdminClient();
}
