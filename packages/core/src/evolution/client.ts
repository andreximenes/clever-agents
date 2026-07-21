import { z } from "zod";

/**
 * Minimal typed client for the Evolution API (v2). Responses are validated
 * loosely (passthrough) so minor server-version differences don't break us.
 */

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

export type ConnectionState = "open" | "connecting" | "close" | "unknown";

const connectionStateSchema = z
  .object({
    instance: z
      .object({ state: z.string() })
      .passthrough()
      .optional(),
    state: z.string().optional(),
  })
  .passthrough();

const connectSchema = z
  .object({
    base64: z.string().optional(),
    code: z.string().optional(),
    pairingCode: z.string().nullish(),
  })
  .passthrough();

const mediaSchema = z
  .object({
    base64: z.string().optional(),
    mimetype: z.string().optional(),
  })
  .passthrough();

const createInstanceSchema = z
  .object({
    qrcode: z
      .object({
        base64: z.string().optional(),
        code: z.string().optional(),
        pairingCode: z.string().nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Events we subscribe the instance webhook to. */
const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

export function createEvolutionClient(config: EvolutionConfig) {
  const base = config.baseUrl.replace(/\/$/, "");

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      const detail =
        (json && typeof json === "object" && "message" in json
          ? JSON.stringify((json as { message: unknown }).message)
          : text) || res.statusText;
      throw new EvolutionError(res.status, `Evolution ${res.status}: ${detail}`);
    }
    return json;
  }

  return {
    /**
     * Creates a new WhatsApp instance (Baileys). The create call already
     * returns a QR code, so we hand it back instead of asking again.
     */
    async createInstance(instanceName: string) {
      const data = await request("POST", "/instance/create", {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });
      const parsed = createInstanceSchema.safeParse(data);
      const qr = parsed.success ? parsed.data.qrcode : undefined;
      return {
        qrBase64: normalizeBase64(qr?.base64),
        code: qr?.code,
        pairingCode: qr?.pairingCode ?? undefined,
      };
    },

    /** Returns true if an instance with this name already exists. */
    async instanceExists(instanceName: string): Promise<boolean> {
      try {
        const data = await request(
          "GET",
          `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
        );
        if (Array.isArray(data)) return data.length > 0;
        return Boolean(data);
      } catch (err) {
        // Some versions answer 404 instead of an empty list.
        if (err instanceof EvolutionError && err.status === 404) return false;
        throw err;
      }
    },

    /** Logs the number out but keeps the instance, so a new QR can be issued. */
    async logout(instanceName: string) {
      return request(
        "DELETE",
        `/instance/logout/${encodeURIComponent(instanceName)}`,
      );
    },

    /** Removes the instance from the Evolution server entirely. */
    async deleteInstance(instanceName: string) {
      return request(
        "DELETE",
        `/instance/delete/${encodeURIComponent(instanceName)}`,
      );
    },

    /** Requests a fresh QR code / pairing code to connect the instance. */
    async connect(instanceName: string) {
      const data = await request(
        "GET",
        `/instance/connect/${encodeURIComponent(instanceName)}`,
      );
      const parsed = connectSchema.parse(data);
      return {
        qrBase64: normalizeBase64(parsed.base64),
        code: parsed.code,
        pairingCode: parsed.pairingCode ?? undefined,
      };
    },

    /** Current connection state of the instance. */
    async connectionState(instanceName: string): Promise<ConnectionState> {
      const data = await request(
        "GET",
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      );
      const parsed = connectionStateSchema.parse(data);
      const raw = parsed.instance?.state ?? parsed.state ?? "unknown";
      if (raw === "open" || raw === "connecting" || raw === "close") return raw;
      return "unknown";
    },

    /** Points the instance webhook at our worker endpoint. */
    async setWebhook(instanceName: string, url: string) {
      return request("POST", `/webhook/set/${encodeURIComponent(instanceName)}`, {
        webhook: {
          enabled: true,
          url,
          webhookByEvents: false,
          webhookBase64: false,
          events: WEBHOOK_EVENTS,
        },
      });
    },

    /**
     * Downloads a received media message as base64 (used to transcribe audio).
     * Returns null when the server can't produce it.
     */
    async getMediaBase64(
      instanceName: string,
      messageId: string,
    ): Promise<{ base64: string; mimetype?: string } | null> {
      try {
        const data = await request(
          "POST",
          `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
          { message: { key: { id: messageId } }, convertToMp4: false },
        );
        const parsed = mediaSchema.safeParse(data);
        if (!parsed.success || !parsed.data.base64) return null;
        return {
          base64: parsed.data.base64,
          mimetype: parsed.data.mimetype,
        };
      } catch {
        return null;
      }
    },

    /** Sends a plain-text WhatsApp message. */
    async sendText(instanceName: string, number: string, text: string) {
      return request(
        "POST",
        `/message/sendText/${encodeURIComponent(instanceName)}`,
        { number, text },
      );
    },
  };
}

export type EvolutionClient = ReturnType<typeof createEvolutionClient>;

export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Ensures a base64 QR string is a data URL usable in an <img src>. */
function normalizeBase64(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}
