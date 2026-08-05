export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const normalizeLevel = (value: string | undefined): LogLevel => {
    const lower = value?.toLowerCase();
    if (!lower) return "info";
    if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error") {
        return lower;
    }
    return "info";
};

const shouldLog = (level: LogLevel, minLevel: LogLevel): boolean => {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
};

const safeStringify = (value: unknown): string => {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, val) => {
        if (val instanceof Error) {
            return {
                name: val.name,
                message: val.message,
                stack: val.stack,
            };
        }
        if (typeof val === "object" && val !== null) {
            if (seen.has(val)) {
                return "[Circular]";
            }
            seen.add(val);
        }
        return val;
    });
};

const baseLog = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    const minLevel = normalizeLevel(process.env.LOG_LEVEL);
    if (!shouldLog(level, minLevel)) return;

    const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context,
    };

    const line = safeStringify(payload);

    if (level === "error") {
        console.error(line);
        return;
    }

    console.log(line);
};

export const logger = {
    debug(message: string, context?: Record<string, unknown>) {
        baseLog("debug", message, context);
    },
    info(message: string, context?: Record<string, unknown>) {
        baseLog("info", message, context);
    },
    warn(message: string, context?: Record<string, unknown>) {
        baseLog("warn", message, context);
    },
    error(message: string, context?: Record<string, unknown>) {
        baseLog("error", message, context);
    },
};
