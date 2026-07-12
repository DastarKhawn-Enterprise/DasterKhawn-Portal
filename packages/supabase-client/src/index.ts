import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type GetTokenFn = () => Promise<string | null>;

export function createSupabaseClient(
  url: string,
  anonKey: string,
  getAccessToken?: GetTokenFn,
): SupabaseClient {
  return createClient(url, anonKey, {
    global: {
      headers: {},
    },
    auth: {
      persistSession: false,
      ...(getAccessToken ? { accessToken: getAccessToken } : {}),
    },
  });
}

export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
