import { config } from "./config.js";
const LOG_LEVEL_WEIGHT = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: Number.POSITIVE_INFINITY,
};
export const logger = {
    log(level, message, data, context) {
        if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[config.logLevel])
            return;
        console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            data,
            context,
        }));
    },
    info(message, data, context) {
        this.log("info", message, data, context);
    },
    warn(message, data, context) {
        this.log("warn", message, data, context);
    },
    error(message, data, context) {
        this.log("error", message, data, context);
    },
    toolResult(toolName, success, durationMs, error) {
        this.log(success ? "info" : "error", "Tool Result", {
            toolName,
            success,
            duration: `${durationMs}ms`,
            error,
        }, { type: "tool-result" });
    },
};
//# sourceMappingURL=logger.js.map