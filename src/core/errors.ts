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

export class ValidationError extends Error {
  tool?: string;
  action?: string;
  fieldErrors: FieldErrorDetail[];
  expected?: Record<string, string>;

  constructor(message: string, options: ValidationErrorOptions = {}) {
    super(message);
    this.name = "ValidationError";
    this.tool = options.tool;
    this.action = options.action;
    this.fieldErrors = options.fieldErrors ?? [];
    this.expected = options.expected;
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
    public url?: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class BilibiliAPIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: unknown,
    public retryable: boolean = false,
    public suggestion?: string,
  ) {
    super(message);
    this.name = "BilibiliAPIError";
  }
}

export class CommentsDisabledError extends BilibiliAPIError {
  constructor(originalError?: unknown) {
    super(
      "该视频评论区不可用或已关闭。",
      "COMMENTS_DISABLED",
      undefined,
      originalError,
      false,
      "换一个视频或改用不依赖评论区的工具。",
    );
    this.name = "CommentsDisabledError";
  }
}

export function formatToolError(error: unknown): {
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
} {
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
