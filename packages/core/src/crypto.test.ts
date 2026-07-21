import { beforeAll, describe, expect, it } from "vitest";

// A valid 32-byte base64 key for the test run.
beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});

describe("crypto", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto.ts");
    const plain = "sk-super-secret-key-1234";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces distinct ciphertext per call (random IV)", async () => {
    const { encryptSecret } = await import("./crypto.ts");
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto.ts");
    const enc = encryptSecret("secret");
    const raw = Buffer.from(enc, "base64");
    const last = raw.length - 1;
    raw[last] = (raw[last] ?? 0) ^ 0xff; // flip a ciphertext bit
    expect(() => decryptSecret(raw.toString("base64"))).toThrow();
  });

  it("masks a secret to last 4 chars", async () => {
    const { maskSecret } = await import("./crypto.ts");
    expect(maskSecret("sk-abcd1234")).toBe("••••1234");
  });
});
