import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

export interface LoginStatus {
  isLogin: boolean;
  mid?: number;
  uname?: string;
}

export async function checkLoginStatus(ctx?: RequestContext): Promise<LoginStatus> {
  try {
    const data = await request<any>(getEndpoint("video", "info", "get_nav"), {}, ctx);
    return {
      isLogin: data?.isLogin === true,
      mid: toOptionalNumber(data?.mid),
      uname: typeof data?.uname === "string" ? data.uname : undefined,
    };
  } catch {
    return { isLogin: false };
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
