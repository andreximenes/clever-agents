"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clearTestConversation, sendTestMessage } from "./actions";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function PlaygroundChat({
  agentId,
  initialMessages,
}: {
  agentId: string;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const onSend = () => {
    const text = input.trim();
    if (!text || isPending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    startTransition(async () => {
      const result = await sendTestMessage(agentId, text);
      if (result.ok) {
        setMessages((m) => [...m, { role: "assistant", content: result.reply }]);
      } else {
        toast.error(result.error);
      }
    });
  };

  const onClear = () => {
    startTransition(async () => {
      await clearTestConversation(agentId);
      setMessages([]);
      router.refresh();
      toast.success("Conversa de teste limpa");
    });
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <span className="text-sm font-medium">Playground</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isPending || messages.length === 0}
        >
          <Trash2 size={14} /> Limpar
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--color-muted)]">
            Envie uma mensagem para testar o agente.
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text)]",
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {isPending ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-2 text-sm text-[var(--color-muted)]">
              <Loader2 size={14} className="animate-spin" /> digitando…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 border-t border-[var(--color-border)] p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Escreva como um cliente…"
          disabled={isPending}
        />
        <Button type="button" onClick={onSend} disabled={isPending}>
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
