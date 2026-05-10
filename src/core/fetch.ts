import { config } from "./config.js";
import { NetworkError, TimeoutError } from "./errors.js";

export async function fetchWithTimeout(
  url: URL,
  init: RequestInit = {},
  timeoutMs: number = config.requestTimeoutMs,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = composeSignals(init.signal, controller.signal);

  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (controller.signal.aborted) {
        throw new TimeoutError(`请求超时：${url.toString()}`, timeoutMs);
      }
      throw new NetworkError(`请求已取消：${url.toString()}`, error, url.toString());
    }
    throw new NetworkError(`请求失败：${url.toString()}`, error instanceof Error ? error : undefined, url.toString());
  } finally {
    clearTimeout(timeout);
  }
}

export function composeSignals(...signals: Array<AbortSignal | null | undefined>): AbortSignal {
  const active = signals.filter(Boolean) as AbortSignal[];
  if (active.length === 1) {
    return active[0];
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}
