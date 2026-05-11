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
