/**
 * Supabase Storage only accepts a restricted character set in object keys —
 * accents, most punctuation and control chars are rejected with "Invalid key".
 * The original filename stays in the database; only the key gets sanitized.
 */
const ALLOWED = /[^a-zA-Z0-9._-]+/g;
const MAX_LENGTH = 120;

/** Turns any filename into a safe Supabase Storage object-key segment. */
export function toStorageName(filename: string): string {
  const stripped = filename
    // Decompose accents ("é" -> "e" + combining mark) and drop the marks.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(ALLOWED, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  if (!stripped) return "arquivo";

  if (stripped.length <= MAX_LENGTH) return stripped;

  // Keep the extension so downloads still open in the right app.
  const dot = stripped.lastIndexOf(".");
  const ext = dot > 0 ? stripped.slice(dot) : "";
  return stripped.slice(0, MAX_LENGTH - ext.length) + ext;
}
