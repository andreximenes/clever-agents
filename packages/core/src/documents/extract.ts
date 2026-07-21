import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export type DocumentKind = "pdf" | "excel" | "word" | "text";

/** Maps a filename + mime type to a supported document kind, or null. */
export function detectKind(
  filename: string,
  mimeType: string,
): DocumentKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const mt = mimeType.toLowerCase();

  if (mt.includes("pdf") || ext === "pdf") return "pdf";
  if (
    mt.includes("spreadsheet") ||
    mt.includes("excel") ||
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv"
  ) {
    return "excel";
  }
  if (
    mt.includes("word") ||
    mt.includes("officedocument.wordprocessing") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return "word";
  }
  if (mt.startsWith("text/") || ext === "txt" || ext === "md") return "text";
  return null;
}

/** Extracts plain text from a supported document buffer. */
export async function extractText(
  buffer: Buffer,
  kind: DocumentKind,
): Promise<string> {
  switch (kind) {
    case "pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
    case "excel": {
      const wb = XLSX.read(buffer, { type: "buffer" });
      return wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        const csv = sheet ? XLSX.utils.sheet_to_csv(sheet) : "";
        return `# ${name}\n${csv}`;
      }).join("\n\n");
    }
    case "word": {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case "text":
      return buffer.toString("utf8");
  }
}

/** Collapses excessive whitespace while keeping paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
