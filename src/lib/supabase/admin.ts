import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";

// Service-role client: bypasses RLS and can manage auth users.
// Server-side only. SUPABASE_SERVICE_ROLE_KEY must never reach the browser.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Returns the signed-in user if (and only if) they are an admin.
// app_metadata can only be written with the service role, so users can't promote themselves.
export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user && user.app_metadata?.role === "admin" ? user : null;
}
