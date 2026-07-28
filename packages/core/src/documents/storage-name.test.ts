import { describe, expect, it } from "vitest";
import { toStorageName } from "./storage-name.ts";

const VALID_KEY = /^[a-zA-Z0-9._-]+$/;

describe("toStorageName", () => {
  it("strips accents and spaces", () => {
    expect(toStorageName("Manual Operacional da Dra. Mércia.pdf")).toBe(
      "Manual-Operacional-da-Dra.-Mercia.pdf",
    );
  });

  it("leaves an already-safe name untouched", () => {
    expect(toStorageName("relatorio_2026-01.xlsx")).toBe(
      "relatorio_2026-01.xlsx",
    );
  });

  it("produces a valid key for messy filenames", () => {
    const messy = [
      "ação & reação (v2).docx",
      "日本語のファイル.pdf",
      "a/b/c.txt",
      "  leading and trailing  .md",
      "100% — cópia #3.csv",
    ];
    for (const name of messy) {
      expect(toStorageName(name)).toMatch(VALID_KEY);
    }
  });

  it("never returns an empty segment", () => {
    expect(toStorageName("###")).toBe("arquivo");
    expect(toStorageName("")).toBe("arquivo");
  });

  it("truncates long names but keeps the extension", () => {
    const name = `${"a".repeat(300)}.pdf`;
    const out = toStorageName(name);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});
