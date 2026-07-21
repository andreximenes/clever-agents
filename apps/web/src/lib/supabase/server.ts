import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { serverWebEnv } from "@/lib/env";

/** Supabase client bound to the request cookies (user session), for Server Components / Actions. */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only;
            // the middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * Admin client using the secret (service_role) key — bypasses RLS. Use only in
 * trusted server code (e.g. inviting users). Never expose to the browser.
 */
export function createAdminSupabase() {
  const env = serverWebEnv();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
