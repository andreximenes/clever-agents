"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  checkWhatsapp,
  connectWhatsapp,
  deleteWhatsappInstance,
  disconnectWhatsapp,
} from "./actions";

type Status = "draft" | "connecting" | "connected" | "disconnected" | "error";

const STATUS_LABEL: Record<Status, string> = {
  draft: "Não conectado",
  connecting: "Aguardando leitura do QR",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro na conexão",
};

export function ConnectionCard({
  agentId,
  initialStatus,
  configured,
  webhookUrl,
}: {
  agentId: string;
  initialStatus: Status;
  configured: boolean;
  webhookUrl: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const result = await checkWhatsapp(agentId);
      if (result.ok) {
        setStatus(result.status);
        if (result.status === "connected") {
          setQr(null);
          setPairingCode(null);
          stopPolling();
          toast.success("WhatsApp conectado!");
          router.refresh();
        }
      }
    }, 4000);
  }, [agentId, router, stopPolling]);

  const onConnect = async () => {
    setLoading(true);
    const result = await connectWhatsapp(agentId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setStatus(result.status);
    setQr(result.qr ?? null);
    setPairingCode(result.pairingCode ?? null);
    if (result.status === "connected") {
      toast.success("WhatsApp já está conectado");
      router.refresh();
    } else {
      startPolling();
    }
  };

  const onCheck = async () => {
    setLoading(true);
    const result = await checkWhatsapp(agentId);
    setLoading(false);
    if (result.ok) {
      setStatus(result.status);
      toast.info(`Status: ${STATUS_LABEL[result.status]}`);
    } else {
      // The action already synced the status when the instance is gone.
      setStatus("disconnected");
      toast.error(result.error);
    }
    router.refresh();
  };

  const onDisconnect = async () => {
    stopPolling();
    setLoading(true);
    const result = await disconnectWhatsapp(agentId);
    setLoading(false);
    if (result.ok) {
      setStatus(result.status);
      setQr(null);
      toast.success("Número desconectado");
    } else {
      toast.error(result.error);
    }
    router.refresh();
  };

  const onDeleteInstance = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 5000);
      return;
    }
    setConfirmingDelete(false);
    stopPolling();
    setLoading(true);
    const result = await deleteWhatsappInstance(agentId);
    setLoading(false);
    if (result.ok) {
      setStatus(result.status);
      setQr(null);
      toast.success("Instância excluída na Evolution. Clique em Conectar para criar de novo.");
    } else {
      toast.error(result.error);
    }
    router.refresh();
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Conexão WhatsApp</CardTitle>
          <CardDescription>
            Escaneie o QR code com o WhatsApp para conectar o número.
          </CardDescription>
        </div>
        <StatusPill status={status} />
      </div>

      {!configured ? (
        <p className="text-sm text-[var(--color-muted)]">
          Preencha a URL, a API Key e o nome da instância da Evolution acima e
          salve o agente para poder conectar.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onConnect} disabled={loading}>
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <QrCode size={16} />
              )}
              {status === "connected" ? "Reconectar" : "Conectar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCheck}
              disabled={loading}
            >
              <RefreshCw size={15} />
              Verificar status
            </Button>
            {status === "connected" || status === "connecting" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onDisconnect}
                disabled={loading}
              >
                <LogOut size={15} />
                Desconectar
              </Button>
            ) : null}
            <Button
              type="button"
              variant={confirmingDelete ? "danger" : "ghost"}
              onClick={onDeleteInstance}
              disabled={loading}
            >
              <Trash2 size={15} />
              {confirmingDelete ? "Confirmar exclusão?" : "Excluir instância"}
            </Button>
          </div>
          {confirmingDelete ? (
            <CardDescription>
              Isso apaga a instância <strong>na Evolution</strong> (o número será
              desconectado). Suas conversas e configurações aqui permanecem.
            </CardDescription>
          ) : null}

          {status === "connected" ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-success)]">
              <Smartphone size={16} />
              Número conectado e pronto para atender.
            </div>
          ) : null}

          {qr ? (
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR code do WhatsApp" width={256} height={256} />
              <p className="text-sm text-black">
                Abra o WhatsApp › Aparelhos conectados › Conectar aparelho
              </p>
              {pairingCode ? (
                <p className="text-sm font-mono text-black">
                  Código: <strong>{pairingCode}</strong>
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <WebhookUrlBlock url={webhookUrl} />
    </Card>
  );
}

/**
 * The agent's webhook endpoint. Shown so a user who prefers to configure things
 * by hand can paste it straight into the Evolution panel.
 */
function WebhookUrlBlock({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="border-t border-[var(--color-border)] pt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">URL do webhook deste agente</span>
        <Button type="button" variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <code className="block w-full overflow-x-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text)]">
        {url}
      </code>
      <CardDescription className="mt-1.5">
        O botão “Conectar” configura isso automaticamente. Se preferir, cadastre
        essa URL no painel da Evolution, habilitando o evento{" "}
        <strong>MESSAGES_UPSERT</strong>. O token na URL é secreto — não
        compartilhe.
      </CardDescription>
      {isLocal ? (
        <p className="mt-1.5 text-xs text-yellow-400">
          Atenção: esta URL é local e não pode ser alcançada pela Evolution.
          Defina WORKER_PUBLIC_URL com um endereço público (túnel ou domínio da VPS).
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    draft: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
    connecting: "bg-yellow-500/15 text-yellow-400",
    connected: "bg-green-500/15 text-green-400",
    disconnected: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
    error: "bg-red-500/15 text-red-400",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
