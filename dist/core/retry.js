export async function withRetry(task, options = {}) {
    const maxRetries = options.maxRetries ?? 1;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                await delay(Math.min((options.baseDelay ?? 250) * 2 ** (attempt - 1), options.maxDelay ?? 1000));
            }
            return await task();
        }
        catch (error) {
            lastError = error;
            if (attempt >= maxRetries || !isRetryable(error)) {
                throw error;
            }
        }
    }
    throw lastError;
}
function isRetryable(error) {
    const candidate = error;
    return (candidate.name === "NetworkError" ||
        candidate.name === "TimeoutError" ||
        candidate.code === "ECONNRESET" ||
        candidate.code === "ETIMEDOUT" ||
        [408, 429, 500, 502, 503, 504].includes(Number(candidate.statusCode)));
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map