export interface FetchCall {
  url: URL;
  init: RequestInit;
}

export function installMockFetch(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
): { calls: FetchCall[]; restore(): void } {
  const previous = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
