export interface FieldErrorDetail {
    field: string;
    message: string;
    received?: unknown;
    expected?: string;
    allowed_values?: Array<string | number>;
}
export interface ValidationErrorOptions {
    tool?: string;
    action?: string;
    fieldErrors?: FieldErrorDetail[];
    expected?: Record<string, string>;
}
export declare class ValidationError extends Error {
    tool?: string;
    action?: string;
    fieldErrors: FieldErrorDetail[];
    expected?: Record<string, string>;
    constructor(message: string, options?: ValidationErrorOptions);
}
export declare class NetworkError extends Error {
    originalError?: Error | undefined;
    url?: string | undefined;
    statusCode?: number | undefined;
    constructor(message: string, originalError?: Error | undefined, url?: string | undefined, statusCode?: number | undefined);
}
export declare class TimeoutError extends Error {
    timeoutMs: number;
    constructor(message: string, timeoutMs: number);
}
export declare class BilibiliAPIError extends Error {
    code: string;
    statusCode?: number | undefined;
    originalError?: unknown | undefined;
    retryable: boolean;
    suggestion?: string | undefined;
    constructor(message: string, code: string, statusCode?: number | undefined, originalError?: unknown | undefined, retryable?: boolean, suggestion?: string | undefined);
}
export declare class CommentsDisabledError extends BilibiliAPIError {
    constructor(originalError?: unknown);
}
export declare function formatToolError(error: unknown): {
    error: true;
    code: string;
    message: string;
    retryable: boolean;
    cookie_source: "cookiecloud";
    suggestion: string;
    tool?: string;
    action?: string;
    field_errors?: FieldErrorDetail[];
    expected?: Record<string, string>;
};
