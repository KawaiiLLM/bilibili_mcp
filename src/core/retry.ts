export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await delay(Math.min((options.baseDelay ?? 250) * 2 ** (attempt - 1), options.maxDelay ?? 1000));
      }
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function isRetryable(error: unknown): boolean {
  const candidate = error as { name?: string; statusCode?: number; code?: string };
  return (
    candidate.name === "NetworkError" ||
    candidate.name === "TimeoutError" ||
    candidate.code === "ECONNRESET" ||
    candidate.code === "ETIMEDOUT" ||
    [408, 429, 500, 502, 503, 504].includes(Number(candidate.statusCode))
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
