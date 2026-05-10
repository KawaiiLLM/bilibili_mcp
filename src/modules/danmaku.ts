import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";
import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

// Source: bilibili-API-collect/grpc_api/bilibili/community/service/dm/v1/dm.proto
const protoPath = resolve(dirname(fileURLToPath(import.meta.url)), "../data/proto/dm.proto");
let dmSegMobileReplyType: Promise<protobuf.Type> | undefined;

export function parseDanmakuXml(xml: string, limit: number): any {
  const matches = [...xml.matchAll(/<d\b[^>]*\bp="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g)];
  const capped = matches.slice(0, clampLimit(limit));
  return {
    total: matches.length,
    returned: capped.length,
    truncated: matches.length > capped.length,
    items: capped.map((match) => {
      const [timeSeconds, mode, fontSize, color] = match[1].split(",");
      return {
        time_seconds: toNumber(timeSeconds),
        mode: toNumber(mode),
        font_size: toNumber(fontSize),
        color: toNumber(color),
        content: decodeHtmlEntities(match[2]),
      };
    }),
  };
}

export async function getXmlDanmaku(input: { cid: number; limit?: number }, ctx?: RequestContext): Promise<any> {
  const xml = await request<string>(getEndpoint("danmaku", "xml", "get"), { cid: input.cid }, ctx);
  return { cid: input.cid, ...parseDanmakuXml(xml, input.limit ?? 100) };
}

export async function getProtoDanmaku(input: { oid: number; segmentIndex?: number; limit?: number }, ctx?: RequestContext): Promise<any> {
  const bytes = await request<Uint8Array>(getEndpoint("danmaku", "seg", "get"), {
    oid: input.oid,
    segment_index: input.segmentIndex ?? 1,
  }, ctx);
  const replyType = await getDmSegMobileReplyType();
  const decoded = replyType.decode(bytes);
  const payload = replyType.toObject(decoded, { longs: Number, enums: Number, defaults: false }) as { elems?: any[] };
  const elems = Array.isArray(payload.elems) ? payload.elems : [];
  const capped = elems.slice(0, clampLimit(input.limit ?? 100));
  return {
    oid: input.oid,
    segment_index: input.segmentIndex ?? 1,
    total: elems.length,
    returned: capped.length,
    truncated: elems.length > capped.length,
    items: capped.map(normalizeDanmakuElem),
  };
}

async function getDmSegMobileReplyType(): Promise<protobuf.Type> {
  if (!dmSegMobileReplyType) {
    dmSegMobileReplyType = readFile(protoPath, "utf8")
      .then((source) => protobuf.parse(source).root)
      .then((root) => root.lookupType("bilibili.community.service.dm.v1.DmSegMobileReply"));
  }
  return dmSegMobileReplyType;
}

function normalizeDanmakuElem(elem: any): any {
  return {
    time_seconds: toNumber(elem?.progress) / 1000,
    mode: toNumber(elem?.mode),
    font_size: toNumber(elem?.fontsize),
    color: toNumber(elem?.color),
    content: String(elem?.content ?? ""),
    ctime: toNumber(elem?.ctime),
    weight: toNumber(elem?.weight),
  };
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|#39);/gi, (entity, body) => {
    const lower = body.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return "\"";
    if (lower === "apos" || lower === "#39") return "'";
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return entity;
  });
}

function clampLimit(limit: number): number {
  return Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 0));
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
