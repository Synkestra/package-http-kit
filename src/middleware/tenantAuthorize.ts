import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AuthLevelPermissionError, AuthTenantForbiddenError, AuthTenantIdError, TokenExpiredError, TokenInvalidError } from "../shared/errors/index.js";
import { UnauthorizedError } from "../shared/abstracts/DomainError.js";
import type { FlatPermission } from "../shared/permission/PermissionConfig.js";
import { AuthType, Req } from "../index.js";
import { PermissionManager } from "../shared/permission/PermissionManager.js";
import { PermissionUtils } from "../shared/permission/PermissionUtils.js";
import { logger } from "../shared/utils/logger.js";
import type { TokenPayload } from "./auth/types.js";
import { extractBearerToken, verifyAndValidateToken } from "./auth/index.js";

const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidTenantId = (value: string | undefined): value is string =>
    !!value && TENANT_ID_PATTERN.test(value);

export interface TenantAuthorizeOptions {
    permissions?: FlatPermission[];     // Lista de permissões necessárias
    required?: boolean;                 // Se a autorização é obrigatória
    jwtSecret?: string;                 // JWT Secret para validação do token
}

/**
 * Propriedades adicionadas pelo middleware de autorização de tenant ao Request
 */
export interface TenantAuthorizeContext {
    customerId: string;
    tenantId: string;
    permissions: FlatPermission[];
}

/**
 * Tipo helper para Request com autorização de tenant
 * Usa este tipo nos métodos que têm o decorator @TenantAuthorize
 *
 * @example
 * ```typescript
 * @TenantAuthorize({ permissions: ['tenant:manage'] })
 * @Get("/settings")
 * async settings(req: TenantAuthorizedReq, res: Res) {
 *     // req.customerId e req.tenantId estão tipados automaticamente!
 *     const customerId = req.customerId;
 *     const tenantId = req.tenantId;
 * }
 * ```
 */
export type TenantAuthorizedReq<TBody = unknown, TQuery = unknown, TParams = unknown> =
    Req<TBody, TQuery, TParams> & TenantAuthorizeContext;

/**
 * Middleware de autorização de tenant
 *
 * Este middleware valida se o tenant tem as permissões necessárias
 * para acessar a rota, utilizando o endpoint /tenants/permissions.
 */
export function tenantAuthorize(
    options?: TenantAuthorizeOptions
): RequestHandler {
    const isRequired = options?.required ?? true;
    const requiredPermissions = (options?.permissions ?? []) as FlatPermission[];
    const jwtSecret = options?.jwtSecret ?? process.env.JWT_SECRET;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                if (!isRequired) return next();
                const error = new UnauthorizedError("Missing authentication token");
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            // Valida formato do Authorization header e extrai token
            let token: string;
            try {
                token = extractBearerToken(authHeader);
            } catch (err) {
                const error = new TokenInvalidError();
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            if (!jwtSecret) {
                logger.error("JWT_SECRET not configured");
                return res.status(500).json({
                    message: "JWT_SECRET not configured. Please provide it via options.jwtSecret or process.env.JWT_SECRET"
                });
            }

            // Verifica e decodifica token
            let decoded: TokenPayload;
            try {
                decoded = verifyAndValidateToken(token, jwtSecret);
            } catch (err) {
                if (err instanceof jwt.TokenExpiredError) {
                    const error = new TokenExpiredError();
                    return res.status(error.statusCode).json(error.toProblemDetails());
                }
                if (err instanceof jwt.JsonWebTokenError) {
                    const error = new TokenInvalidError();
                    return res.status(error.statusCode).json(error.toProblemDetails());
                }

                // Não expõe detalhes do erro ao cliente
                logger.error("Token validation error", { error: err });
                const error = new TokenInvalidError();
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            const authType = decoded.authType;
            const isCredentialAuth = authType === AuthType.CREDENTIAL;

            if (isCredentialAuth) {
                // @ts-expect-error
                (req as Record<string, unknown>).authType = AuthType.CREDENTIAL;
                // @ts-expect-error
                (req as Record<string, unknown>).clientId = decoded.clientId;
                // @ts-expect-error
                (req as Record<string, unknown>).customerId = decoded.clientId;
                // @ts-expect-error
                (req as Record<string, unknown>).tenantId = decoded.tenantId;
            } else {
                // @ts-expect-error
                (req as Record<string, unknown>).authType = AuthType.PASSWORD;
                // @ts-expect-error
                (req as Record<string, unknown>).customerId = decoded.customerId;
            }

            const headerTenant = req.headers["x-client-id"] as string | string[] | undefined;
            const tenantId = Array.isArray(headerTenant) ? headerTenant[0] : headerTenant;

            if (!tenantId) {
                const error = new AuthTenantIdError("X-Client-ID header is required");
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            if (!isValidTenantId(tenantId)) {
                const error = new AuthTenantIdError("Invalid X-Client-ID header");
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            // @ts-expect-error
            (req as Record<string, unknown>).tenantId = tenantId;

            const currentUrl = new URL(req.url, `http://${req.headers.host}`);

            if (currentUrl.pathname.endsWith("/tenants/permissions")) {
                next();
                return;
            }

            const response = await fetch(`${process.env.AUTH_SERVICE_URL}/tenants/permissions`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "X-Client-ID": tenantId
                }
            });

            if (!response.ok) {
                console.log(response);

                const error = new AuthTenantForbiddenError();
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            const data = await response.json() as { permissions: string[] };

            const permissions = PermissionUtils.filterValid(data?.permissions ?? []);

            (req as any).permissions = permissions;

            if (requiredPermissions.length > 0 && !isCredentialAuth) {
                const myPermissions = PermissionManager.fromJSON(permissions);

                const hasPermission = requiredPermissions.some((rp) =>
                    myPermissions.has(rp as FlatPermission)
                );

                if (!hasPermission) {
                    return next(
                        new AuthLevelPermissionError(
                            "Tenant does not have required permissions",
                            "INSUFFICIENT_PERMISSIONS"
                        )
                    );
                }
            }

            next();
        } catch (err) {
            console.log(err);

            const traceId = (req.headers['x-trace-id'] || req.headers['trace-id']) as string | undefined;
            logger.warn('Tenant authorization failed', {
                event: 'tenant_auth_error',
                traceId,
                path: req.originalUrl || req.path,
                error: err,
            });
            if (!isRequired) {
                return next();
            }

            const error = new AuthTenantForbiddenError();
            return res.status(error.statusCode).json(error.toProblemDetails());
        }
    };
}

// Symbol para armazenar metadados de autorização de tenant (exportado para uso no BaseController)
export const TENANT_AUTHORIZE_METADATA_KEY = Symbol('controller:tenant_authorize');

/**
 * Decorator para aplicar autorização de tenant em métodos de controller
 *
 * @example
 * class TenantController extends BaseController {
 *     @TenantAuthorize({ permissions: ['tenant:manage'] })
 *     @Get('/')
 *     settings(req: Req, res: Res) {
 *         // ...
 *     }
 * }
 */
export function TenantAuthorize(options?: TenantAuthorizeOptions): MethodDecorator {
    return (
        target: object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor | undefined => {
        const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, TenantAuthorizeOptions>>;
        if (!targetConstructor[TENANT_AUTHORIZE_METADATA_KEY]) {
            targetConstructor[TENANT_AUTHORIZE_METADATA_KEY] = {};
        }
        targetConstructor[TENANT_AUTHORIZE_METADATA_KEY][String(propertyKey)] = options || {};

        return descriptor;
    };
}

/**
 * Helper para obter os metadados de autorização de tenant de um controller
 */
export function getTenantAuthorizeMetadata(target: object, propertyKey: string): TenantAuthorizeOptions | undefined {
    const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, TenantAuthorizeOptions>>;
    const authMetadata = targetConstructor[TENANT_AUTHORIZE_METADATA_KEY];
    return authMetadata?.[propertyKey];
}
