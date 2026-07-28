import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

/**
 * Handles the redirect from invite / email-confirmation links and turns it into
 * a session, then sends the user on to `next` (usually "set your password").
 *
 * Two shapes arrive here, and both must work:
 *  - `?code=`                  — PKCE, from a browser-initiated flow.
 *  - `?token_hash=&type=`      — from admin-generated invite links, which have
 *                                no PKCE verifier and must be verified directly.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Behind Traefik the request origin is the container's internal address, so
  // every redirect built from it would send the user to their own localhost.
  const origin = siteUrl();
  const next = searchParams.get("next") ?? "/";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("auth callback: code exchange failed", error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error("auth callback: otp verification failed", error.message);
  } else {
    // Landing here with neither means the link was malformed or already used.
    console.error("auth callback: no code or token_hash in the link");
  }

  // Say why, instead of dropping the user on a login form asking for a password
  // they were never given.
  return NextResponse.redirect(`${origin}/login?erro=convite_invalido`);
}
