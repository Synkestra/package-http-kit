import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ForbiddenError } from "../shared/abstracts/DomainError.js";
import { logger } from "../shared/utils/logger.js";

const DEFAULT_PRIVATE_CIDRS = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
];

export interface InternalOnlyOptions {
    allowlist?: string[];
    allowPrivate?: boolean;
    required?: boolean;
    trustProxy?: boolean;
}

const splitAllowlist = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
        .split(/[\s,]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
};

const normalizeIp = (ip: string): string => {
    const trimmed = ip.trim();
    if (trimmed.startsWith("::ffff:")) {
        return trimmed.slice(7);
    }
    return trimmed;
};

const parseIPv4 = (ip: string): number | null => {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return (
        (nums[0] << 24) +
        (nums[1] << 16) +
        (nums[2] << 8) +
        nums[3]
    ) >>> 0;
};

const matchesCidrV4 = (ip: string, cidr: string): boolean => {
    const [range, bitsRaw] = cidr.split("/");
    const bits = Number(bitsRaw);
    if (!range || Number.isNaN(bits)) return false;
    const ipNum = parseIPv4(ip);
    const rangeNum = parseIPv4(range);
    if (ipNum === null || rangeNum === null) return false;
    if (bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
};

const matchesAllowlist = (ip: string, allowlist: string[]): boolean => {
    const normalized = normalizeIp(ip);
    return allowlist.some((entry) => {
        const rule = entry.trim();
        if (!rule) return false;
        if (rule.includes("/")) {
            if (rule.includes(".")) {
                return matchesCidrV4(normalized, rule);
            }
            return false;
        }
        return normalizeIp(rule) === normalized;
    });
};

const isPrivateIp = (ip: string): boolean => {
    const normalized = normalizeIp(ip);
    if (normalized === "::1") return true;
    if (normalized.includes(":")) {
        const prefix = normalized.slice(0, 2).toLowerCase();
        return prefix === "fc" || prefix === "fd";
    }
    return DEFAULT_PRIVATE_CIDRS.some((cidr) => matchesCidrV4(normalized, cidr));
};

const getClientIp = (req: Request, trustProxy: boolean): string | undefined => {
    if (trustProxy) {
        const forwarded = req.headers["x-forwarded-for"];
        if (Array.isArray(forwarded)) {
            return forwarded[0]?.split(",")[0]?.trim();
        }
        if (typeof forwarded === "string" && forwarded.length > 0) {
            return forwarded.split(",")[0]?.trim();
        }
    }

    return req.ip || req.socket?.remoteAddress || undefined;
};

export function internalOnly(options?: InternalOnlyOptions): RequestHandler {
    const isRequired = options?.required ?? true;
    const allowPrivate = options?.allowPrivate ?? true;
    const trustProxy = options?.trustProxy ?? true;

    const envAllowlist = splitAllowlist(process.env.INTERNAL_IP_ALLOWLIST);
    const allowlist = (options?.allowlist?.length ? options.allowlist : envAllowlist).map((item) => item.trim());

    return (req: Request, res: Response, next: NextFunction) => {
        const clientIp = getClientIp(req, trustProxy);

        if (!clientIp) {
            if (!isRequired) return next();
            logger.warn("Internal-only request blocked", {
                event: "internal_only_blocked",
                reason: "missing_ip",
                path: req.originalUrl || req.path,
            });
            const error = new ForbiddenError("Internal network only");
            return res.status(error.statusCode).json(error.toProblemDetails());
        }

        const isAllowed =
            matchesAllowlist(clientIp, allowlist) ||
            (allowPrivate && isPrivateIp(clientIp));

        if (!isAllowed) {
            if (!isRequired) return next();
            logger.warn("Internal-only request blocked", {
                event: "internal_only_blocked",
                reason: "not_allowed",
                ip: clientIp,
                path: req.originalUrl || req.path,
            });
            const error = new ForbiddenError("Internal network only");
            return res.status(error.statusCode).json(error.toProblemDetails());
        }

        return next();
    };
}

export const INTERNAL_ONLY_METADATA_KEY = Symbol('controller:internal_only');

export function InternalOnly(options?: InternalOnlyOptions): MethodDecorator {
    return (
        target: object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor | undefined => {
        const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, InternalOnlyOptions>>;
        if (!targetConstructor[INTERNAL_ONLY_METADATA_KEY]) {
            targetConstructor[INTERNAL_ONLY_METADATA_KEY] = {};
        }
        targetConstructor[INTERNAL_ONLY_METADATA_KEY][String(propertyKey)] = options || {};

        return descriptor;
    };
}

export function getInternalOnlyMetadata(target: object, propertyKey: string): InternalOnlyOptions | undefined {
    const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, InternalOnlyOptions>>;
    const authMetadata = targetConstructor[INTERNAL_ONLY_METADATA_KEY];
    return authMetadata?.[propertyKey];
}
