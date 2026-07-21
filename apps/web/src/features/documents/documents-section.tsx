"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { deleteDocument, uploadDocument } from "./actions";

export type DocumentItem = {
  id: string;
  filename: string;
  status: "processing" | "ready" | "error";
  summary: string;
  chunkCount: number;
  embedded: boolean;
  sizeBytes: number;
  error: string | null;
};

const ACCEPT = ".pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.md";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsSection({
  agentId,
  documents,
}: {
  agentId: string;
  documents: DocumentItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await uploadDocument(agentId, fd);
      if (result.ok) toast.success("Documento processado");
      else toast.error(result.error);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await deleteDocument(agentId, id);
      if (result.ok) toast.success("Documento removido");
      else toast.error(result.error);
      setBusyId(null);
      router.refresh();
    });
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Base de conhecimento</CardTitle>
          <CardDescription>
            Envie PDF, Excel, Word, TXT ou MD. O agente usa esse material no
            atendimento.
          </CardDescription>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onFile}
            disabled={isPending}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            Enviar arquivo
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Nenhum documento ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
            >
              <FileText size={18} className="mt-0.5 text-[var(--color-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {doc.filename}
                  </span>
                  <StatusTag status={doc.status} embedded={doc.embedded} />
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {formatSize(doc.sizeBytes)}
                  {doc.status === "ready"
                    ? ` · ${doc.chunkCount} trechos`
                    : ""}
                </p>
                {doc.status === "ready" && doc.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--color-muted)]">
                    {doc.summary}
                  </p>
                ) : null}
                {doc.status === "error" && doc.error ? (
                  <p className="mt-1 text-xs text-[var(--color-danger)]">
                    {doc.error}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(doc.id)}
                disabled={isPending && busyId === doc.id}
                aria-label="Remover documento"
              >
                <Trash2 size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusTag({
  status,
  embedded,
}: {
  status: DocumentItem["status"];
  embedded: boolean;
}) {
  if (status === "processing") {
    return (
      <span className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-400">
        Processando
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
        Erro
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
      {embedded ? "Pronto · busca" : "Pronto · resumo"}
    </span>
  );
}
