import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AuthLevelPermissionError, TokenExpiredError, TokenInvalidError } from "../shared/errors/index.js";
import { UnauthorizedError } from "../shared/abstracts/DomainError.js";
import { FlatPermission, Req } from "../index.js";
import { logger } from "../shared/utils/logger.js";
import { PermissionUtils } from "../shared/permission/PermissionUtils.js";
import {
    AuthType,
    type AuthorizeOptions,
    type AuthorizeContext,
    type TokenPayload,
    extractBearerToken,
    verifyAndValidateToken,
    sanitizeTenantId,
    timingSafePermissionCheck,
} from "./auth/index.js";

// Re-exporta tipos para manter compatibilidade com imports existentes
export { AuthType, type AuthorizeOptions, type AuthorizeContext } from "./auth/index.js";
export type { CredentialTokenPayload, UserTokenPayload, TokenPayload } from "./auth/types.js";

/**
 * Tipo helper para Request com autorização
 * Usa este tipo nos métodos que têm o decorator @Authorize
 *
 * @example
 * ```typescript
 * @Authorize({ permissions: ['auth:validate'], roles: ['user'] })
 * @Get("/validate")
 * async validate(req: AuthorizedReq, res: Res) {
 *     // req.customerId está tipado automaticamente!
 *     const customerId = req.customerId;
 * }
 * ```
 */
export type AuthorizedReq<TBody = unknown, TQuery = unknown, TParams = unknown> =
    Req<TBody, TQuery, TParams> & AuthorizeContext;

/**
 * Middleware de autorização
 *
 * Este middleware valida se o usuário tem as permissões/roles necessárias
 * para acessar a rota. Por enquanto, está mockado para sempre permitir o acesso.
 */
export function authorize(
    options?: AuthorizeOptions
): RequestHandler {
    const isRequired = options?.required ?? true;
    const requiredPermissions = (options?.permissions ?? []) as FlatPermission[];
    const roles = options?.roles ?? [];
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

            // Valida JWT_SECRET
            if (!jwtSecret) {
                logger.error("JWT_SECRET not configured");
                return res.status(500).json({
                    message: "Authentication service misconfigured"
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

            let tenantId: string | undefined;

            if (isCredentialAuth) {
                // @ts-expect-error
                (req as Record<string, unknown>).authType = AuthType.CREDENTIAL;
                // @ts-expect-error
                (req as Record<string, unknown>).clientId = decoded.clientId;
                // @ts-expect-error
                (req as Record<string, unknown>).tenantId = decoded.tenantId;
                // @ts-expect-error
                (req as Record<string, unknown>).customerId = decoded.clientId;

                tenantId = decoded.tenantId;
            } else {
                // @ts-expect-error
                (req as Record<string, unknown>).authType = AuthType.PASSWORD;
                // @ts-expect-error
                (req as Record<string, unknown>).customerId = decoded.customerId;

                // Sanitiza e valida X-Client-ID header
                const sanitizedTenantId = sanitizeTenantId(req.headers["x-client-id"] as string | string[] | undefined);
                tenantId = sanitizedTenantId ?? decoded.tenantId;

                // @ts-expect-error
                (req as Record<string, unknown>).tenantId = tenantId;
            }

            const authServiceUrl = process.env.AUTH_SERVICE_URL;

            if (!authServiceUrl) {
                logger.error("AUTH_SERVICE_URL not configured");
                return res.status(500).json({
                    message: "Authentication service misconfigured"
                });
            }

            const validationType = isCredentialAuth ? "credential" : "password";

            const validateUrl = new URL(`${authServiceUrl}/auth/validate`);

            const currentUrl = new URL(req.url, `http://${req.headers.host}`);

            if (currentUrl.pathname === "/api/v1/iam/auth/validate") {
                next();
                return;
            }

            validateUrl.searchParams.set("type", validationType);

            const response = await fetch(validateUrl.toString(), {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    ...(tenantId ? { "X-Client-ID": tenantId } : {})
                }
            });

            if (!response.ok) {
                const error = new UnauthorizedError("Authorization failed");
                return res.status(error.statusCode).json(error.toProblemDetails());
            }

            const data = await response.json() as { permissions?: string[], role?: string };

            const userPermissions = PermissionUtils.normalizePermissions(
                (data.permissions || []) as FlatPermission[]
            );

            // @ts-expect-error
            (req as Record<string, unknown>).permissions = userPermissions;

            if (roles.length > 0) {
                if (!data.role || !roles.includes(data.role)) {
                    const error = new AuthLevelPermissionError(
                        "User does not have required role",
                        "INSUFFICIENT_ROLE"
                    );
                    return res.status(error.statusCode).json(error.toProblemDetails());
                }

                // @ts-expect-error
                (req as Record<string, unknown>).role = data.role;
            }

            // Usa comparação timing-safe para verificar permissões
            if (requiredPermissions.length > 0) {
                const hasAllPermissions = timingSafePermissionCheck(requiredPermissions, userPermissions);

                if (!hasAllPermissions) {
                    const error = new AuthLevelPermissionError(
                        "User does not have required permissions",
                        "INSUFFICIENT_PERMISSIONS"
                    );
                    return res.status(error.statusCode).json(error.toProblemDetails());
                }
            }

            next();
        } catch (err) {
            const traceId = (req.headers['x-trace-id'] || req.headers['trace-id']) as string | undefined;

            // Loga erro mas não expõe detalhes ao cliente
            logger.warn('Authorization failed', {
                event: 'auth_error',
                traceId,
                path: req.originalUrl || req.path,
                error: err instanceof Error ? err.message : 'Unknown error',
            });

            if (!isRequired) {
                return next();
            }

            const error = new UnauthorizedError("Authorization failed");
            return res.status(error.statusCode).json(error.toProblemDetails());
        }
    };
}

// Symbol para armazenar metadados de autorização (exportado para uso no BaseController)
export const AUTHORIZE_METADATA_KEY = Symbol('controller:authorize');

/**
 * Decorator para aplicar autorização em métodos de controller
 *
 * @example
 * class UserController extends BaseController {
 *     @Authorize({ permissions: ['user:read'] })
 *     @Get('/')
 *     list(req: Req, res: Res) {
 *         // ...
 *     }
 * }
 */
export function Authorize(options?: AuthorizeOptions): MethodDecorator {
    return (
        target: object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor | undefined => {
        const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, AuthorizeOptions>>;
        if (!targetConstructor[AUTHORIZE_METADATA_KEY]) {
            targetConstructor[AUTHORIZE_METADATA_KEY] = {};
        }
        targetConstructor[AUTHORIZE_METADATA_KEY][String(propertyKey)] = options || {};

        return descriptor;
    };
}

/**
 * Helper para obter os metadados de autorização de um controller
 */
export function getAuthorizeMetadata(target: object, propertyKey: string): AuthorizeOptions | undefined {
    const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, AuthorizeOptions>>;
    const authMetadata = targetConstructor[AUTHORIZE_METADATA_KEY];
    return authMetadata?.[propertyKey];
}
