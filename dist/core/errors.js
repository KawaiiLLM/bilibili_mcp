export class ValidationError extends Error {
    tool;
    action;
    fieldErrors;
    expected;
    constructor(message, options = {}) {
        super(message);
        this.name = "ValidationError";
        this.tool = options.tool;
        this.action = options.action;
        this.fieldErrors = options.fieldErrors ?? [];
        this.expected = options.expected;
    }
}
export class NetworkError extends Error {
    originalError;
    url;
    statusCode;
    constructor(message, originalError, url, statusCode) {
        super(message);
        this.originalError = originalError;
        this.url = url;
        this.statusCode = statusCode;
        this.name = "NetworkError";
    }
}
export class TimeoutError extends Error {
    timeoutMs;
    constructor(message, timeoutMs) {
        super(message);
        this.timeoutMs = timeoutMs;
        this.name = "TimeoutError";
    }
}
export class BilibiliAPIError extends Error {
    code;
    statusCode;
    originalError;
    retryable;
    suggestion;
    constructor(message, code, statusCode, originalError, retryable = false, suggestion) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.originalError = originalError;
        this.retryable = retryable;
        this.suggestion = suggestion;
        this.name = "BilibiliAPIError";
    }
}
export class CommentsDisabledError extends BilibiliAPIError {
    constructor(originalError) {
        super("该视频评论区不可用或已关闭。", "COMMENTS_DISABLED", undefined, originalError, false, "换一个视频或改用不依赖评论区的工具。");
        this.name = "CommentsDisabledError";
    }
}
export function formatToolError(error) {
    if (error instanceof BilibiliAPIError) {
        return {
            error: true,
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            cookie_source: "cookiecloud",
            suggestion: error.suggestion || "请检查 CookieCloud 配置和 B 站登录状态。",
        };
    }
    if (error instanceof ValidationError) {
        return {
            error: true,
            code: "VALIDATION_ERROR",
            message: error.message,
            retryable: false,
            cookie_source: "cookiecloud",
            suggestion: "请按字段说明修正参数后重试。",
            tool: error.tool,
            action: error.action,
            field_errors: error.fieldErrors,
            expected: error.expected,
        };
    }
    if (error instanceof TimeoutError) {
        return {
            error: true,
            code: "REQUEST_TIMEOUT",
            message: error.message,
            retryable: true,
            cookie_source: "cookiecloud",
            suggestion: "稍后重试，或提高请求超时时间。",
        };
    }
    if (error instanceof NetworkError) {
        return {
            error: true,
            code: "NETWORK_ERROR",
            message: error.message,
            retryable: true,
            cookie_source: "cookiecloud",
            suggestion: "请检查网络连通性、代理设置或 CookieCloud 地址。",
        };
    }
    return {
        error: true,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "未知错误",
        retryable: false,
        cookie_source: "cookiecloud",
        suggestion: "请查看 stderr 日志定位问题。",
    };
}
//# sourceMappingURL=errors.js.map