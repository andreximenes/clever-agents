"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { getDocumentPreview, type DocumentPreview } from "./actions";

/** Read-only viewer for an uploaded document: what the agent actually reads. */
export function DocumentPreviewDialog({
  agentId,
  documentId,
  filename,
  onClose,
}: {
  agentId: string;
  documentId: string;
  filename: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<DocumentPreview | null>(null);

  useEffect(() => {
    let active = true;
    void getDocumentPreview(agentId, documentId).then((result) => {
      if (active) setPreview(result);
    });
    return () => {
      active = false;
    };
  }, [agentId, documentId]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conteúdo de ${filename}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{filename}</CardTitle>
            {preview?.ok ? (
              <CardDescription>
                {preview.charCount.toLocaleString("pt-BR")} caracteres ·{" "}
                {preview.chunkCount} trechos
              </CardDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {preview?.ok && preview.downloadUrl ? (
              <a href={preview.downloadUrl} target="_blank" rel="noreferrer">
                <Button type="button" variant="secondary" size="sm">
                  <Download size={14} />
                  Baixar original
                </Button>
              </a>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={16} />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!preview ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Loader2 size={15} className="animate-spin" /> Carregando…
            </p>
          ) : !preview.ok ? (
            <p className="text-sm text-[var(--color-danger)]">{preview.error}</p>
          ) : (
            <>
              {preview.summary ? (
                <section className="mb-5 rounded-[var(--radius)] bg-[var(--color-surface-2)] p-3">
                  <p className="mb-1 text-xs font-medium text-[var(--color-muted)]">
                    RESUMO USADO PELO AGENTE
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{preview.summary}</p>
                </section>
              ) : null}

              <p className="mb-1 text-xs font-medium text-[var(--color-muted)]">
                TEXTO EXTRAÍDO
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-[var(--color-text)]">
                {preview.text || "(sem texto extraído)"}
              </pre>
              {preview.truncated ? (
                <p className="mt-3 text-xs text-[var(--color-muted)]">
                  Mostrando apenas o início do documento. Baixe o original para
                  ver o conteúdo completo.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
