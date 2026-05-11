import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
export function createConfirmationStore(secret = randomBytes(32).toString("hex"), ttlMs = DEFAULT_TTL_MS) {
    const tokens = new Map();
    return {
        ttlSeconds: Math.floor(ttlMs / 1000),
        create(action, params) {
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
        consume(token, action, params) {
            const now = Date.now();
            cleanupExpired(tokens, now);
            const entry = tokens.get(token);
            if (!entry)
                return { ok: false, reason: "not_found" };
            tokens.delete(token);
            if (now > entry.expiresAt)
                return { ok: false, reason: "expired" };
            if (entry.action !== action || !timingSafeEqualHex(entry.paramsHash, hashParams(secret, canonicalizeParams(params)))) {
                return { ok: false, reason: "mismatch" };
            }
            return { ok: true };
        },
        cleanup(now = Date.now()) {
            cleanupExpired(tokens, now);
        },
    };
}
export function canonicalizeParams(params) {
    return JSON.stringify(normalizeForCanonicalJson(params));
}
function normalizeForCanonicalJson(value) {
    if (Array.isArray(value))
        return value.map(normalizeForCanonicalJson);
    if (value && typeof value === "object") {
        const normalized = {};
        for (const key of Object.keys(value).sort()) {
            if (key !== "confirmation_token") {
                normalized[key] = normalizeForCanonicalJson(value[key]);
            }
        }
        return normalized;
    }
    return value;
}
function sign(secret, action, params, createdAt) {
    return createHmac("sha256", secret).update(action).update("\n").update(params).update("\n").update(String(createdAt)).digest("hex");
}
function hashParams(secret, params) {
    return createHmac("sha256", secret).update(params).digest("hex");
}
export function timingSafeEqualHex(left, right) {
    if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right) || left.length !== right.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
function cleanupExpired(tokens, now) {
    for (const [token, entry] of tokens) {
        if (now > entry.expiresAt)
            tokens.delete(token);
    }
}
//# sourceMappingURL=confirmation.js.map