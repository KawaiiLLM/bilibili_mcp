import { ValidationError } from "../core/errors.js";
export function assertAllowedArgs(tool, args, allowed) {
    const extra = Object.keys(args).filter((key) => !allowed.includes(key));
    if (extra.length > 0) {
        throw new ValidationError("存在不支持的参数。", {
            tool,
            fieldErrors: extra.map((field) => ({ field, message: "该参数不被当前工具支持。", received: args[field] })),
        });
    }
}
export function requireString(tool, args, field) {
    const value = args[field];
    if (typeof value === "string" && value.trim().length > 0)
        return value.trim();
    throw new ValidationError(`${field} 是必填字符串。`, {
        tool,
        fieldErrors: [{ field, message: `${field} 必须是非空字符串。`, received: value }],
    });
}
export function optionalString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
export function optionalNumber(tool, args, field) {
    const value = args[field];
    if (value === undefined)
        return undefined;
    const numeric = Number(value);
    if (Number.isFinite(numeric))
        return numeric;
    throw new ValidationError(`${field} 必须是数字。`, {
        tool,
        fieldErrors: [{ field, message: `${field} 必须是数字。`, received: value }],
    });
}
export function positiveInteger(value, fallback, field, tool) {
    const numeric = Math.floor(value ?? fallback);
    if (numeric > 0)
        return numeric;
    throw new ValidationError(`${field} 必须是大于 0 的整数。`, {
        tool,
        fieldErrors: [{ field, message: `${field} 必须大于 0。`, received: value }],
    });
}
export function optionalNumberArray(value, field, tool) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} 必须是数字数组。`, {
            tool,
            fieldErrors: [{ field, message: `${field} 必须是数组。`, received: value }],
        });
    }
    return value.map((item) => {
        const numeric = Number(item);
        if (!Number.isFinite(numeric)) {
            throw new ValidationError(`${field} 中存在非数字。`, { tool });
        }
        return Math.floor(numeric);
    });
}
//# sourceMappingURL=common.js.map