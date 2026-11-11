import { createClient } from "@/lib/supabase/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

// Keep the legacy export names while using the same cookie-backed browser
// client as login, so QR and enrollment screens share the authenticated session.
export const supabase = isSupabaseConfigured ? createClient() : null;

export function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Não foi possível autenticar com o Supabase.";

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return message || "Não foi possível autenticar com o Supabase.";
}
