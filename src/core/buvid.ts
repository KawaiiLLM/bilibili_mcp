import { BASE_URLS, DEFAULT_HEADERS } from "./constants.js";
import { fetchWithTimeout } from "./fetch.js";

let cached: string | undefined;

export async function getBuvidCookies(signal?: AbortSignal): Promise<string | undefined> {
  if (cached) return cached;
  try {
    const response = await fetchWithTimeout(new URL("/x/frontend/finger/spi", BASE_URLS.api), {
      headers: DEFAULT_HEADERS,
      signal,
    });
    if (!response.ok) return undefined;
    const payload = await response.json();
    const buvid3 = payload?.data?.b_3;
    const buvid4 = payload?.data?.b_4;
    cached = [
      typeof buvid3 === "string" ? `buvid3=${buvid3}` : undefined,
      typeof buvid4 === "string" ? `buvid4=${buvid4}` : undefined,
    ].filter(Boolean).join("; ");
    return cached || undefined;
  } catch {
    return undefined;
  }
}

export function appendBuvidCookies(cookieHeader: string | undefined, buvid: string): string {
  return [cookieHeader, buvid].filter(Boolean).join("; ");
}

export function clearBuvidCache(): void {
  cached = undefined;
}
