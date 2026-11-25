import { randomBytes } from "node:crypto";

export type EvolutionConfig = {
  baseUrl: string;
  /** The server's GLOBAL_API_KEY. */
  apiKey: string;
};

export type ConnectionState = "open" | "connecting" | "close" | "unknown";

/**
 * Client for Evolution Go (whatsmeow), the WhatsApp engine behind the agents.
 * Routes checked against the server's Swagger (`/swagger/doc.json`, v0.7.2):
 * - listing, creating and deleting instances use the GLOBAL api key;
 * - connect, QR, logout, send and media use the INSTANCE token.
 * The instance token is looked up by name from the list, so the app only
 * stores the global key.
 */

type Obj = Record<string, unknown>;

type GoInstance = {
  id: string;
  name: string;
  token: string;
  connected: boolean;
  qrcode: string;
  disconnectReason: string;
  webhook: string;
};

const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** Responses are wrapped as `{ data, message }`. */
const data = (v: unknown): Obj => {
  const o = obj(v);
  return o.data && typeof o.data === "object" && !Array.isArray(o.data)
    ? obj(o.data)
    : o;
};
const pick = (o: Obj, ...names: string[]): unknown =>
  names.map((n) => o[n]).find((v) => v !== undefined && v !== null && v !== "");

const SUBSCRIBE = ["MESSAGE", "CONNECTION"];

function toInstance(raw: unknown): GoInstance {
  const o = obj(raw);
  return {
    id: str(o.id),
    name: str(o.name),
    token: str(o.token),
    connected: o.connected === true,
    qrcode: str(pick(o, "qrcode", "Qrcode")),
    disconnectReason: str(o.disconnect_reason),
    webhook: str(o.webhook),
  };
}

/** `data:audio/ogg; codecs=opus;base64,XXXX` → raw base64 + mimetype. */
function splitDataUrl(value: string): { base64: string; mimetype?: string } {
  if (!value.startsWith("data:")) return { base64: value.trim() };
  const comma = value.indexOf(",");
  const header = value.slice(5, comma);
  const mimetype = header.split(";")[0]?.trim() || undefined;
  return { base64: value.slice(comma + 1).trim(), mimetype };
}

/** The Go server addresses individual chats by phone digits. */
function toNumber(target: string): string {
  return target.endsWith("@s.whatsapp.net") ? target.split("@")[0]! : target;
}

export function createEvolutionClient(config: EvolutionConfig) {
  const base = config.baseUrl.replace(/\/$/, "");
  const globalKey = config.apiKey;

  async function request(
    method: string,
    path: string,
    key: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: key },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      const detail =
        str(obj(json).error) || str(obj(json).message) || res.statusText;
      throw new EvolutionError(res.status, `Evolution Go ${res.status}: ${detail}`);
    }
    return json;
  }

  async function list(): Promise<GoInstance[]> {
    const json = obj(await request("GET", "/instance/all", globalKey));
    const rows = Array.isArray(json.data) ? json.data : [];
    return rows.map(toInstance);
  }

  async function find(name: string): Promise<GoInstance | null> {
    return (await list()).find((i) => i.name === name) ?? null;
  }

  async function require(name: string): Promise<GoInstance> {
    const found = await find(name);
    if (!found) {
      throw new EvolutionError(404, `Evolution Go: instância "${name}" não existe`);
    }
    return found;
  }

  /**
   * Connect on an already-connected instance only updates its configuration
   * (it does not drop the session). The webhook is always re-sent: an empty
   * `webhookUrl` would erase the one already registered.
   */
  async function startConnection(instance: GoInstance, webhookUrl: string) {
    await request("POST", "/instance/connect", instance.token, {
      webhookUrl,
      subscribe: webhookUrl ? SUBSCRIBE : [],
      immediate: true,
    });
  }

  async function qrOf(instance: GoInstance) {
    const res = data(await request("GET", "/instance/qr", instance.token));
    const qr = str(pick(res, "qrcode", "Qrcode", "base64"));
    const code = str(pick(res, "code", "Code"));
    return {
      qrBase64: qr ? normalizeBase64(qr) : undefined,
      code: code || undefined,
      pairingCode: undefined as string | undefined,
    };
  }

  return {
    /** Creates the instance. The QR only exists after connect(), so none here. */
    async createInstance(instanceName: string) {
      await request("POST", "/instance/create", globalKey, {
        name: instanceName,
        token: randomBytes(24).toString("hex"),
        // 1:1 assistant: ignore groups/status, reject calls.
        advancedSettings: {
          alwaysOnline: false,
          rejectCall: true,
          readMessages: false,
          ignoreGroups: true,
          ignoreStatus: true,
        },
      });
      return {
        qrBase64: undefined as string | undefined,
        code: undefined as string | undefined,
        pairingCode: undefined as string | undefined,
      };
    },

    async instanceExists(instanceName: string): Promise<boolean> {
      return (await find(instanceName)) !== null;
    },

    async logout(instanceName: string) {
      const instance = await require(instanceName);
      return request("DELETE", "/instance/logout", instance.token);
    },

    async deleteInstance(instanceName: string) {
      const instance = await require(instanceName);
      return request("DELETE", `/instance/delete/${instance.id}`, globalKey);
    },

    /** Starts the session (if needed) and returns the QR to scan, if any. */
    async connect(instanceName: string) {
      const instance = await require(instanceName);
      await startConnection(instance, instance.webhook);
      return qrOf(instance);
    },

    async connectionState(instanceName: string): Promise<ConnectionState> {
      const instance = await require(instanceName);
      if (instance.connected) return "open";
      if (instance.qrcode || instance.disconnectReason) return "connecting";
      return "close";
    },

    /** Registers our worker as the webhook (also starts the connection). */
    async setWebhook(instanceName: string, url: string) {
      const instance = await require(instanceName);
      return startConnection(instance, url);
    },

    /**
     * Downloads a received media message as base64. Evolution Go needs the
     * raw `Message` object from the webhook, not just the message id.
     */
    async getMediaBase64(
      instanceName: string,
      _messageId: string,
      rawMessage?: unknown,
    ): Promise<{ base64: string; mimetype?: string } | null> {
      if (!rawMessage) return null;
      try {
        const instance = await require(instanceName);
        const res = data(
          await request("POST", "/message/downloadmedia", instance.token, {
            message: rawMessage,
          }),
        );
        const value = str(pick(res, "base64", "Base64"));
        if (!value) return null;
        const { base64, mimetype } = splitDataUrl(value);
        return base64 ? { base64, mimetype } : null;
      } catch {
        return null;
      }
    },

    /** Sends a plain-text message; shape matches the Evolution API result. */
    async sendText(instanceName: string, target: string, text: string) {
      const instance = await require(instanceName);
      const res = data(
        await request("POST", "/send/text", instance.token, {
          number: toNumber(target),
          text,
        }),
      );
      const info = obj(pick(res, "Info", "info") ?? res);
      const id = str(pick(info, "ID", "Id", "id"));
      return { key: { id: id || undefined } };
    },
  };
}

export type EvolutionClient = ReturnType<typeof createEvolutionClient>;

/** Error from the Evolution server, carrying the HTTP status. */
export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Ensures a base64 QR string is a data URL usable in an <img src>. */
export function normalizeBase64(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}
