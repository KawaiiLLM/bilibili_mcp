import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type ConfirmationFailureReason = "not_found" | "expired" | "mismatch";
export type ConfirmationConsumeResult = { ok: true } | { ok: false; reason: ConfirmationFailureReason };

export interface ConfirmationStore {
  create(action: string, params: unknown): string;
  consume(token: string, action: string, params: unknown): ConfirmationConsumeResult;
  cleanup(now?: number): void;
  ttlSeconds: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createConfirmationStore(
  secret: string = randomBytes(32).toString("hex"),
  ttlMs: number = DEFAULT_TTL_MS,
): ConfirmationStore {
  const tokens = new Map<string, { action: string; paramsHash: string; expiresAt: number }>();
  return {
    ttlSeconds: Math.floor(ttlMs / 1000),
    create(action: string, params: unknown): string {
      const createdAt = Date.now();
      cleanupExpired(tokens, createdAt);
      const canonicalParams = canonicalizeParams(params);
      const token = `${createdAt}.${sign(secret, action, canonicalParams, createdAt)}`;
      tokens.set(token, {
        action,
        paramsHash: hashParams(secret, canonicalParams),
        expiresAt: createdAt + ttlMs,
      });
      return token;
    },
    consume(token: string, action: string, params: unknown): ConfirmationConsumeResult {
      const now = Date.now();
      cleanupExpired(tokens, now);
      const entry = tokens.get(token);
      if (!entry) return { ok: false, reason: "not_found" };
      tokens.delete(token);
      if (now > entry.expiresAt) return { ok: false, reason: "expired" };
      if (entry.action !== action || !timingSafeEqualHex(entry.paramsHash, hashParams(secret, canonicalizeParams(params)))) {
        return { ok: false, reason: "mismatch" };
      }
      return { ok: true };
    },
    cleanup(now = Date.now()): void {
      cleanupExpired(tokens, now);
    },
  };
}

export function canonicalizeParams(params: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(params));
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForCanonicalJson);
  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key !== "confirmation_token") {
        normalized[key] = normalizeForCanonicalJson((value as Record<string, unknown>)[key]);
      }
    }
    return normalized;
  }
  return value;
}

function sign(secret: string, action: string, params: string, createdAt: number): string {
  return createHmac("sha256", secret).update(action).update("\n").update(params).update("\n").update(String(createdAt)).digest("hex");
}

function hashParams(secret: string, params: string): string {
  return createHmac("sha256", secret).update(params).digest("hex");
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right) || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function cleanupExpired(tokens: Map<string, { expiresAt: number }>, now: number): void {
  for (const [token, entry] of tokens) {
    if (now > entry.expiresAt) tokens.delete(token);
  }
}
