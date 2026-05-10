import { config } from "./config.js";

export type LogLevel = "info" | "warn" | "error" | "debug";

const LOG_LEVEL_WEIGHT: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

export const logger = {
  log(level: LogLevel, message: string, data?: unknown, context?: Record<string, unknown>): void {
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[config.logLevel]) return;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      context,
    }));
  },
  info(message: string, data?: unknown, context?: Record<string, unknown>): void {
    this.log("info", message, data, context);
  },
  warn(message: string, data?: unknown, context?: Record<string, unknown>): void {
    this.log("warn", message, data, context);
  },
  error(message: string, data?: unknown, context?: Record<string, unknown>): void {
    this.log("error", message, data, context);
  },
  toolResult(toolName: string, success: boolean, durationMs: number, error?: string): void {
    this.log(success ? "info" : "error", "Tool Result", {
      toolName,
      success,
      duration: `${durationMs}ms`,
      error,
    }, { type: "tool-result" });
  },
};
