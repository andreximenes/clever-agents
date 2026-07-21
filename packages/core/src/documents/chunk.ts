export type ChunkOptions = {
  /** Target chunk size in characters (~4 chars per token). */
  size?: number;
  /** Overlap between consecutive chunks, in characters. */
  overlap?: number;
};

/**
 * Splits text into overlapping chunks, preferring paragraph then sentence
 * boundaries so a chunk rarely cuts mid-sentence.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const size = options.size ?? 1200;
  const overlap = options.overlap ?? 150;
  const clean = text.trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    if (end < clean.length) {
      // Prefer to break at a paragraph, then sentence, then whitespace.
      const window = clean.slice(start, end);
      const para = window.lastIndexOf("\n\n");
      const sentence = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
      );
      const space = window.lastIndexOf(" ");
      const breakAt = para > size * 0.5 ? para : sentence > size * 0.5 ? sentence : space;
      if (breakAt > 0) end = start + breakAt + 1;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
