"use server";

import { getDb, profiles } from "@clever/core/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * Persists the theme on the user's profile (so it follows them across devices)
 * and mirrors it to a cookie, which the root layout reads to paint the correct
 * theme on the very first render.
 */
export async function saveThemePreference(theme: Theme) {
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const user = await getSessionUser();
  if (!user) return;

  const db = getDb();
  await db.update(profiles).set({ theme }).where(eq(profiles.id, user.id));
}
