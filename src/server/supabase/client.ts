import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/server/core/env";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getPublicSupabaseEnv();
  return createClient(url, anonKey);
}
