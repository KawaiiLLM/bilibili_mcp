import { createHmac } from "node:crypto";

const HMAC_SECRET = "XgwSnGZ1p";

function hmacSha256(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

// Test seam — not part of public API
export const _hmacSha256ForTest = hmacSha256;
