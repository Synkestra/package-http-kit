import type { Request, Response, NextFunction } from 'express';
import type { ZodType, output } from 'zod';
import type { MetricsConfig } from '../metrics/MetricsManager';

/**
 * Request tipado com inferência de Zod schemas
 * Usa Omit para substituir os tipos do Express pelos tipos inferidos
 */
export type TypedRequest<
    TBody = unknown,
    TQuery = unknown,
    TParams = unknown,
> = Omit<Request, 'body' | 'query' | 'params'> & {
    body: TBody;
    query: TQuery;
    params: TParams;
};

/**
 * Infere o tipo de output de um ZodSchema ou retorna o tipo padrão
 */
export type InferSchema<T, TDefault = unknown> = T extends ZodType<infer U> ? U : TDefault;

/**
 * Handler tipado com inferência automática dos schemas
 */
export type TypedHandler<
    TBody = unknown,
    TQuery = unknown,
    TParams = unknown,
> = (
    req: TypedRequest<TBody, TQuery, TParams>,
    res: Response,
    next: NextFunction
) => Promise<void> | void;

/**
 * Configuração de rota tipada com schemas
 */
export interface TypedRouteConfig<
    TBody extends ZodType | undefined = undefined,
    TQuery extends ZodType | undefined = undefined,
    TParams extends ZodType | undefined = undefined,
> {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
    bodySchema?: TBody;
    querySchema?: TQuery;
    paramsSchema?: TParams;
    headersSchema?: ZodType;
    middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;
    authorizeMetadata?: Record<string, unknown>;
    internalOnlyMetadata?: Record<string, unknown>;
    tenantAuthorizeMetadata?: Record<string, unknown>;
    handler: (
        req: TypedRequest<
            TBody extends ZodType ? output<TBody> : unknown,
            TQuery extends ZodType ? output<TQuery> : unknown,
            TParams extends ZodType ? output<TParams> : unknown
        >,
        res: Response,
        next: NextFunction
    ) => Promise<void> | void;
}

/**
 * Helper function para criar rota com tipagem automática
 * O tipo do req é inferido automaticamente dos schemas
 *
 * @example
 * ```typescript
 * const createUser = route({
 *     method: 'post',
 *     path: '/users',
 *     bodySchema: z.object({ name: z.string(), email: z.string().email() }),
 *     handler: (req, res) => {
 *         // req.body é automaticamente tipado como { name: string, email: string }
 *         res.json({ name: req.body.name });
 *     },
 * });
 * ```
 */
export function route<
    TBody extends ZodType | undefined = undefined,
    TQuery extends ZodType | undefined = undefined,
    TParams extends ZodType | undefined = undefined,
>(config: TypedRouteConfig<TBody, TQuery, TParams>): IRoute {
    return {
        method: config.method,
        path: config.path,
        handler: config.handler as IRoute['handler'],
        bodySchema: config.bodySchema,
        querySchema: config.querySchema,
        paramsSchema: config.paramsSchema,
        headersSchema: config.headersSchema,
        middleware: config.middleware,
        authorizeMetadata: config.authorizeMetadata,
        internalOnlyMetadata: config.internalOnlyMetadata,
        tenantAuthorizeMetadata: config.tenantAuthorizeMetadata,
    };
}

export interface IRoute {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (req: any, res: Response, next: NextFunction) => Promise<void> | void;
    bodySchema?: ZodType;
    headersSchema?: ZodType;
    querySchema?: ZodType;
    paramsSchema?: ZodType;
    middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;
    authorizeMetadata?: Record<string, unknown>;
    internalOnlyMetadata?: Record<string, unknown>;
    tenantAuthorizeMetadata?: Record<string, unknown>;
}

export interface IMiddleware {
    handler: (req: Request, res: Response, next: NextFunction) => void;
    priority?: number;
}

export interface IErrorHandler {
    (error: unknown, req: Request, res: Response, next: NextFunction): void;
}

export interface ILogger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}

export interface IExpressAdapterConfig {
    jsonLimit?: string;
    enableCors?: boolean;
    corsOptions?: Record<string, unknown>;
    logging?: boolean;
    enableOpenApi?: boolean;
    basePath?: string;
    logger?: ILogger;
    /** Habilitar métricas Prometheus. Passa `true` para defaults ou um objeto MetricsConfig. */
    metrics?: boolean | MetricsConfig;
    /** Path do endpoint de métricas (default: '/metrics') */
    metricsPath?: string;
}

export interface IRouteGroup {
    prefix: string;
    routes: IRoute[];
}

export interface IController {
    readonly basePath: string;
    getRoutes(): IRoute[];
    getRouteGroups(): IRouteGroup[];
    buildRoutes(): IRoute[];
}
