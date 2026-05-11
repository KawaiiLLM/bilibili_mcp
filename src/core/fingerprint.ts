export function genBLsid(): string {
  let prefix = "";
  for (let i = 0; i < 8; i += 1) {
    prefix += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  }
  return `${prefix}_${Date.now().toString(16).toUpperCase()}`;
}

const INFOC_ALPHABET: string[] = (() => {
  const pool: string[] = [];
  for (let i = 1; i <= 9; i += 1) pool.push(String(i));
  for (const c of "ABCDEF") pool.push(c);
  pool.push("10"); // intentional two-char element per reference network.py:1607
  return pool;
})();

function pickInfoc(count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += INFOC_ALPHABET[Math.floor(Math.random() * INFOC_ALPHABET.length)];
  }
  return out;
}

export function genUuidInfoc(): string {
  const groups = [pickInfoc(8), pickInfoc(4), pickInfoc(4), pickInfoc(4), pickInfoc(12)];
  const t = Date.now() % 100000;
  return `${groups.join("-")}${String(t).padEnd(5, "0")}infoc`;
}

const MASK64 = (1n << 64n) - 1n;
const MURMUR_C1 = 0x87c37b91114253d5n;
const MURMUR_C2 = 0x4cf5ad432745937fn;
const MURMUR_C3 = 0x52dce729n;
const MURMUR_C4 = 0x38495ab5n;

function rotl64(value: bigint, count: number): bigint {
  const c = BigInt(count);
  return ((value << c) | (value >> (64n - c))) & MASK64;
}

function fmix64(value: bigint): bigint {
  let tmp = value;
  tmp ^= tmp >> 33n;
  tmp = (tmp * 0xff51afd7ed558ccdn) & MASK64;
  tmp ^= tmp >> 33n;
  tmp = (tmp * 0xc4ceb9fe1a85ec53n) & MASK64;
  tmp ^= tmp >> 33n;
  return tmp;
}

function readLE64(buffer: Buffer, offset: number): bigint {
  // Reference uses struct.unpack("<q", ...) (signed). For murmur3 the sign doesn't matter
  // when we re-mask with MASK64 immediately after every multiply, so we read unsigned.
  return buffer.readBigUInt64LE(offset);
}

export function murmur3x64_128(input: string, seed: number): string {
  const bytes = Buffer.from(input, "ascii");
  let h1 = BigInt(seed);
  let h2 = BigInt(seed);
  let offset = 0;
  const total = bytes.length;

  while (offset + 16 <= total) {
    const k1 = readLE64(bytes, offset);
    const k2 = readLE64(bytes, offset + 8);
    h1 ^= (rotl64((k1 * MURMUR_C1) & MASK64, 31) * MURMUR_C2) & MASK64;
    h1 = (((rotl64(h1, 27) + h2) & MASK64) * 5n + MURMUR_C3) & MASK64;
    h2 ^= (rotl64((k2 * MURMUR_C2) & MASK64, 33) * MURMUR_C1) & MASK64;
    h2 = (((rotl64(h2, 31) + h1) & MASK64) * 5n + MURMUR_C4) & MASK64;
    offset += 16;
  }

  let k1 = 0n;
  let k2 = 0n;
  const remaining = total - offset;
  if (remaining >= 15) k2 ^= BigInt(bytes[offset + 14]) << 48n;
  if (remaining >= 14) k2 ^= BigInt(bytes[offset + 13]) << 40n;
  if (remaining >= 13) k2 ^= BigInt(bytes[offset + 12]) << 32n;
  if (remaining >= 12) k2 ^= BigInt(bytes[offset + 11]) << 24n;
  if (remaining >= 11) k2 ^= BigInt(bytes[offset + 10]) << 16n;
  if (remaining >= 10) k2 ^= BigInt(bytes[offset + 9]) << 8n;
  if (remaining >= 9) {
    k2 ^= BigInt(bytes[offset + 8]);
    k2 = (rotl64((k2 * MURMUR_C2) & MASK64, 33) * MURMUR_C1) & MASK64;
    h2 ^= k2;
  }
  if (remaining >= 8) k1 ^= BigInt(bytes[offset + 7]) << 56n;
  if (remaining >= 7) k1 ^= BigInt(bytes[offset + 6]) << 48n;
  if (remaining >= 6) k1 ^= BigInt(bytes[offset + 5]) << 40n;
  if (remaining >= 5) k1 ^= BigInt(bytes[offset + 4]) << 32n;
  if (remaining >= 4) k1 ^= BigInt(bytes[offset + 3]) << 24n;
  if (remaining >= 3) k1 ^= BigInt(bytes[offset + 2]) << 16n;
  if (remaining >= 2) k1 ^= BigInt(bytes[offset + 1]) << 8n;
  if (remaining >= 1) {
    k1 ^= BigInt(bytes[offset]);
    k1 = (rotl64((k1 * MURMUR_C1) & MASK64, 31) * MURMUR_C2) & MASK64;
    h1 ^= k1;
  }

  h1 ^= BigInt(total);
  h2 ^= BigInt(total);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  h1 = fmix64(h1);
  h2 = fmix64(h2);
  h1 = (h1 + h2) & MASK64;
  h2 = (h2 + h1) & MASK64;
  return `${h1.toString(16)}${h2.toString(16)}`;
}
