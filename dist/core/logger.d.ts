export type LogLevel = "info" | "warn" | "error" | "debug";
export declare const logger: {
    log(level: LogLevel, message: string, data?: unknown, context?: Record<string, unknown>): void;
    info(message: string, data?: unknown, context?: Record<string, unknown>): void;
    warn(message: string, data?: unknown, context?: Record<string, unknown>): void;
    error(message: string, data?: unknown, context?: Record<string, unknown>): void;
    toolResult(toolName: string, success: boolean, durationMs: number, error?: string): void;
};
