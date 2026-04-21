import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseEnv } from "@/server/core/env";

export function createServerSupabaseClient() {
  const { url, serviceRoleKey } = getServerSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
