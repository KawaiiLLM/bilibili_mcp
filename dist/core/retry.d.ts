export interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
}
export declare function withRetry<T>(task: () => Promise<T>, options?: RetryOptions): Promise<T>;
