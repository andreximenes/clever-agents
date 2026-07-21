"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { createAgent, deleteAgent, updateAgent } from "./actions";
import {
  AI_PROVIDERS,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_MODELS,
  agentFormSchema,
  type AgentFormValues,
} from "./schema";

type Props = {
  mode: "create" | "edit";
  agentId?: string;
  defaultValues?: Partial<AgentFormValues>;
  hasAiKey?: boolean;
  hasEvolutionKey?: boolean;
  /** Invited members can edit but not delete the agent. */
  canDelete?: boolean;
  /**
   * Which group of fields to show. Every section stays mounted (hidden via CSS)
   * so one Save always submits the whole agent.
   */
  section?: "agente" | "ia" | "whatsapp" | "all";
};

export function AgentForm({
  mode,
  agentId,
  defaultValues,
  hasAiKey,
  hasEvolutionKey,
  canDelete = true,
  section = "all",
}: Props) {
  const shows = (id: "agente" | "ia" | "whatsapp") =>
    section === "all" || section === id;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setDeleting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      name: "",
      instructions: DEFAULT_INSTRUCTIONS,
      debounceSeconds: 30,
      aiProvider: "openai",
      aiModel: DEFAULT_MODELS.openai,
      aiApiKey: "",
      evolutionMode: "existing",
      evolutionUrl: "",
      evolutionApiKey: "",
      evolutionInstanceName: "",
      ...defaultValues,
    },
  });

  const onSubmit = (values: AgentFormValues) => {
    const fd = new FormData();
    for (const [key, val] of Object.entries(values)) {
      fd.set(key, String(val ?? ""));
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createAgent(fd)
          : await updateAgent(agentId!, fd);
      if (result.ok) {
        toast.success(mode === "create" ? "Agente criado" : "Agente salvo");
        router.push(`/agents/${result.agentId}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const onDelete = () => {
    if (!agentId) return;
    setDeleting(true);
    startTransition(async () => {
      const result = await deleteAgent(agentId);
      if (result.ok) {
        toast.success("Agente excluído");
        router.push("/");
        router.refresh();
      } else {
        toast.error(result.error);
        setDeleting(false);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card className={cn("space-y-4", !shows("agente") && "hidden")}>
        <CardTitle>Identidade</CardTitle>
        <div>
          <Label htmlFor="name">Nome do agente</Label>
          <Input id="name" {...register("name")} placeholder="Atendente Loja X" />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="instructions">Instruções (Markdown)</Label>
          <Controller
            control={control}
            name="instructions"
            render={({ field }) => (
              <MarkdownEditor
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            )}
          />
          <CardDescription className="mt-1">
            Escreva em Markdown: use títulos, listas e negrito para organizar o
            comportamento do agente.
          </CardDescription>
          <FieldError>{errors.instructions?.message}</FieldError>
        </div>
        <div>
          <div className="max-w-40">
            <Label htmlFor="debounceSeconds">Espera antes de responder (s)</Label>
            <Input
              id="debounceSeconds"
              type="number"
              min={5}
              max={600}
              {...register("debounceSeconds")}
            />
          </div>
          <CardDescription className="mt-1">
            O agente aguarda esse tempo <strong>após a última mensagem</strong>. Se
            o cliente mandar outra antes, a contagem recomeça — assim ele não
            responde no meio de um assunto.
          </CardDescription>
          <FieldError>{errors.debounceSeconds?.message}</FieldError>
        </div>
      </Card>

      <Card className={cn("space-y-4", !shows("ia") && "hidden")}>
        <CardTitle>Inteligência artificial</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="aiProvider">Provider</Label>
            <Select
              id="aiProvider"
              {...register("aiProvider")}
              onChange={(e) => {
                setValue("aiProvider", e.target.value as never);
                setValue("aiModel", DEFAULT_MODELS[e.target.value] ?? "");
              }}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="aiModel">Modelo</Label>
            <Input id="aiModel" {...register("aiModel")} />
            <FieldError>{errors.aiModel?.message}</FieldError>
          </div>
        </div>
        <div>
          <Label htmlFor="aiApiKey">Chave da API</Label>
          <Input
            id="aiApiKey"
            type="password"
            autoComplete="off"
            placeholder={hasAiKey ? "•••• (deixe em branco para manter)" : "sk-…"}
            {...register("aiApiKey")}
          />
          <FieldError>{errors.aiApiKey?.message}</FieldError>
        </div>
      </Card>

      <Card className={cn("space-y-4", !shows("whatsapp") && "hidden")}>
        <CardTitle>WhatsApp (Evolution API)</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="evolutionUrl">URL do servidor Evolution</Label>
            <Input
              id="evolutionUrl"
              {...register("evolutionUrl")}
              placeholder="https://evo.seudominio.com"
            />
            <FieldError>{errors.evolutionUrl?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="evolutionInstanceName">Nome da instância</Label>
            <Input
              id="evolutionInstanceName"
              {...register("evolutionInstanceName")}
              placeholder="minha-instancia"
            />
            <CardDescription className="mt-1">
              Se ainda não existir no seu Evolution, ela é criada ao conectar.
            </CardDescription>
            <FieldError>{errors.evolutionInstanceName?.message}</FieldError>
          </div>
        </div>
        <div>
          <Label htmlFor="evolutionApiKey">API Key da Evolution</Label>
          <Input
            id="evolutionApiKey"
            type="password"
            autoComplete="off"
            placeholder={
              hasEvolutionKey ? "•••• (deixe em branco para manter)" : "apikey"
            }
            {...register("evolutionApiKey")}
          />
          <CardDescription className="mt-1">
            O pareamento (QR code) e o webhook são configurados na tela do agente
            após salvar.
          </CardDescription>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        {mode === "edit" && canDelete ? (
          <Button
            type="button"
            variant="danger"
            onClick={onDelete}
            disabled={isPending || isDeleting}
          >
            Excluir agente
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Salvando…"
            : mode === "create"
              ? "Criar agente"
              : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
