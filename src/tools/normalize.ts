export const DANMAKU_MODE_LABELS: Record<number, string> = {
  1: "滚动",
  4: "底端",
  5: "顶端",
  6: "逆向",
  7: "高级",
  8: "代码",
  9: "BAS",
};

export function stripHtml(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeAbsoluteUrl(url: unknown): string {
  const value = String(url ?? "").trim();
  if (!value) return "";
  return value.startsWith("//") ? `https:${value}` : value;
}

export function colorIntToHex(value: number): string {
  const numeric = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `#${numeric.toString(16).padStart(6, "0")}`;
}

export function truncateText(value: unknown, max: number): string {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
