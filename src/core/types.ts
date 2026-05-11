import type { BaseUrlName } from "./constants.js";

export const API_FILE_NAMES = ["video", "comment", "danmaku", "search", "ranking", "action", "auth"] as const;
export type ApiFileName = (typeof API_FILE_NAMES)[number];
export type HttpMethod = "GET" | "POST";
export type ParamsType = "query" | "body";
export type ContentType = "form" | "json";
export type ResponseType = "json" | "proto" | "text" | "binary";

export type PrimitiveParam = string | number | boolean;
export type RequestParams = Record<string, PrimitiveParam | undefined | null>;

export interface CookieCloudCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  hostOnly?: boolean;
}

export interface Credential {
  cookieHeader: string;
  cookies: CookieCloudCookie[];
  refreshAt?: number;
  refreshedAt?: number;
}

export interface RequestContext {
  credential?: Credential;
  cache?: boolean;
  signal?: AbortSignal;
}

export interface ApiEndpoint {
  url: string;
  method: HttpMethod;
  wbi: boolean;
  wbi2?: boolean;
  auth: boolean;
  csrf: boolean;
  buvid: boolean;
  params_type: ParamsType;
  content_type?: ContentType;
  response_type: ResponseType;
  base_url?: BaseUrlName;
  referer?: string;
  defaults?: RequestParams;
  comment: string;
}

export type ApiGroup = Record<string, ApiEndpoint>;
export type ApiFile = Record<string, ApiGroup>;

export interface BilibiliJsonEnvelope<T = unknown> {
  code: number;
  message?: string;
  msg?: string;
  data?: T;
  result?: T;
}
