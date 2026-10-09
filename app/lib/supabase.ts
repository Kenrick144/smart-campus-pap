import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Não foi possível autenticar com o Supabase.";

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return message || "Não foi possível autenticar com o Supabase.";
}
