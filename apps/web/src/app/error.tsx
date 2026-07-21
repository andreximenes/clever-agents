"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

/**
 * A deploy replaces the fingerprinted JS chunks, so a tab left open can fail to
 * lazy-load one ("ChunkLoadError"). That is recoverable with a reload, so we
 * do it automatically instead of leaving the user on a dead screen.
 */
function isStaleBuildError(error: Error): boolean {
  return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(
    `${error.name} ${error.message}`,
  );
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isStaleBuildError(error)) {
      window.location.reload();
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardTitle>Algo deu errado</CardTitle>
        <CardDescription className="mt-2">
          {isStaleBuildError(error)
            ? "O aplicativo foi atualizado. Recarregando…"
            : "Não conseguimos carregar esta tela. Tente novamente."}
        </CardDescription>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">
            {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <Button type="button" onClick={reset}>
            <RefreshCw size={15} />
            Tentar novamente
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </Button>
        </div>
      </Card>
    </main>
  );
}
