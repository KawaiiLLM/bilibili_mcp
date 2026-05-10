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

export type VideoCardSource = "hot" | "ranking" | "weekly" | "must_watch" | "search" | "related";

export interface VideoCard {
  bvid: string;
  aid: number;
  title: string;
  url: string;
  cover: string;
  duration_seconds: number;
  duration_text: string;
  owner: { mid: number; name: string; avatar: string };
  stat: {
    view: number; like: number; coin: number; favorite: number;
    reply: number; danmaku: number; share: number;
  };
  description?: string;
  pub_location?: string;
  category?: string;
  pubdate?: number;
  extras?: Record<string, unknown>;
}

const DESCRIPTION_MAX = 200;

export function normalizeVideoCard(raw: any, source: VideoCardSource): VideoCard {
  const owner = raw?.owner ?? {};
  const bvid = String(raw?.bvid ?? "");
  const aid = toNum(raw?.aid);
  const durationSeconds = parseDurationSeconds(raw?.duration);
  const titleRaw = raw?.title;
  const descriptionRaw = source === "search" ? raw?.description : raw?.desc;
  const description = truncateText(stripHtml(descriptionRaw), DESCRIPTION_MAX);
  const card: VideoCard = {
    bvid,
    aid,
    title: stripHtml(titleRaw),
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : "",
    cover: normalizeAbsoluteUrl(raw?.pic),
    duration_seconds: durationSeconds,
    duration_text: formatDuration(durationSeconds),
    owner: {
      mid: source === "search" ? toNum(raw?.mid ?? owner?.mid) : toNum(owner?.mid),
      name: String((source === "search" ? raw?.author : owner?.name) ?? ""),
      avatar: normalizeAbsoluteUrl(source === "search" ? raw?.upic ?? owner?.face : owner?.face),
    },
    stat: pickStat(raw, source),
  };
  if (description) card.description = description;
  const pubLocation = optionalString(raw?.pub_location);
  if (pubLocation) card.pub_location = pubLocation;
  const category = optionalString(raw?.tnamev2 ?? raw?.tname);
  if (category) card.category = category;
  const pubdate = source === "search" ? toNum(raw?.senddate ?? raw?.pubdate) : toNum(raw?.pubdate);
  if (pubdate > 0) card.pubdate = pubdate;
  const extras = pickExtras(raw, source);
  if (Object.keys(extras).length > 0) card.extras = extras;
  return card;
}

function pickStat(raw: any, source: VideoCardSource): VideoCard["stat"] {
  if (source === "search") {
    return {
      view: toNum(raw?.play),
      like: toNum(raw?.like),
      coin: 0,
      favorite: toNum(raw?.favorites),
      reply: toNum(raw?.review),
      danmaku: toNum(raw?.danmaku ?? raw?.video_review),
      share: 0,
    };
  }
  const stat = raw?.stat ?? {};
  return {
    view: toNum(stat.view),
    like: toNum(stat.like),
    coin: toNum(stat.coin),
    favorite: toNum(stat.favorite),
    reply: toNum(stat.reply),
    danmaku: toNum(stat.danmaku),
    share: toNum(stat.share),
  };
}

function pickExtras(raw: any, source: VideoCardSource): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  switch (source) {
    case "hot":
      if (raw?.rcmd_reason?.content) extras.rcmd_reason = raw.rcmd_reason.content;
      if (typeof raw?.his_rank === "number") extras.his_rank = raw.his_rank;
      if (typeof raw?.season_type === "number") extras.season_type = raw.season_type;
      break;
    case "weekly":
      if (typeof raw?.episodic_index === "number") extras.episodic_index = raw.episodic_index;
      if (raw?.rcmd_reason?.content) extras.rcmd_reason = raw.rcmd_reason.content;
      break;
    case "must_watch":
      if (raw?.rcmd_reason?.content) extras.rcmd_reason = raw.rcmd_reason.content;
      if (typeof raw?.is_steins_gate === "number") extras.is_steins_gate = raw.is_steins_gate;
      break;
    case "ranking":
      if (raw?.score !== undefined) extras.score = raw.score;
      if (raw?.rank !== undefined) extras.rank = raw.rank;
      break;
    case "search":
      if (raw?.tag) extras.tag = String(raw.tag);
      if (raw?.rank_score !== undefined) extras.rank_score = Number(raw.rank_score);
      if (raw?.is_pay !== undefined) extras.is_pay = Boolean(raw.is_pay);
      break;
    case "related":
      // no extras
      break;
  }
  return extras;
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return Number(value);
    const match = value.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (match) {
      const [, a, b, c] = match;
      return c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
    }
  }
  return 0;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toNum(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface VideoListResult {
  list: VideoCard[];
  page?: number;
  has_more?: boolean;
  total?: number;
}

export interface NormalizeVideoListOptions {
  limit?: number;
  arrayKey?: string;
}

export function normalizeVideoList(
  payload: unknown,
  source: VideoCardSource,
  opts: NormalizeVideoListOptions = {},
): VideoListResult {
  const { limit, arrayKey = "list" } = opts;
  const items = extractArray(payload, arrayKey);
  const limited = typeof limit === "number" && limit > 0 ? items.slice(0, limit) : items;
  const list = limited.map((raw) => normalizeVideoCard(raw, source));
  const result: VideoListResult = { list };
  if (!Array.isArray(payload) && payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const page = toOptionalPositiveInt(obj.page ?? obj.pn);
    if (page !== undefined) result.page = page;
    const total = toOptionalPositiveInt(obj.numResults ?? obj.total);
    if (total !== undefined) result.total = total;
    const hasMore = inferHasMore(obj, items.length, limited.length);
    if (hasMore !== undefined) result.has_more = hasMore;
  }
  return result;
}

function extractArray(payload: unknown, arrayKey: string): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>)[arrayKey];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : undefined;
}

function inferHasMore(obj: Record<string, unknown>, fullCount: number, returnedCount: number): boolean | undefined {
  if (typeof obj.no_more === "boolean") return !obj.no_more;
  if (typeof obj.has_more === "boolean") return obj.has_more;
  const next = Number(obj.next);
  if (Number.isFinite(next) && next > 0) return true;
  if (returnedCount < fullCount) return true;
  return undefined;
}

export interface DanmakuItem {
  time_seconds: number;
  content: string;
  mode: number;
  mode_label: string;
  font_size: number;
  color: number;
  color_hex: string;
}

export function normalizeDanmakuItem(raw: any): DanmakuItem {
  const mode = toNum(raw?.mode);
  const color = toNum(raw?.color);
  return {
    time_seconds: typeof raw?.time_seconds === "number" ? raw.time_seconds : toNum(raw?.time_seconds),
    content: String(raw?.content ?? ""),
    mode,
    mode_label: DANMAKU_MODE_LABELS[mode] ?? "未知",
    font_size: toNum(raw?.font_size),
    color,
    color_hex: colorIntToHex(color),
  };
}

export interface SubtitleEntry {
  id: number;
  lan: string;
  lan_doc: string;
  type: number;
  ai_generated: boolean;
  subtitle_url: string;
}

export function normalizeSubtitleEntry(raw: any): SubtitleEntry {
  return {
    id: toNum(raw?.id),
    lan: String(raw?.lan ?? ""),
    lan_doc: String(raw?.lan_doc ?? ""),
    type: toNum(raw?.type),
    ai_generated: raw?.ai_type === 1,
    subtitle_url: normalizeAbsoluteUrl(raw?.subtitle_url),
  };
}
