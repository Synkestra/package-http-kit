import type { Response, NextFunction } from 'express';
import type { ZodType, output } from 'zod';
import { InferSchema, IRoute, TypedRequest } from '../../types';
import { AUTHORIZE_METADATA_KEY } from '../../middleware/authorize';
import { INTERNAL_ONLY_METADATA_KEY } from '../../middleware/internalOnly';
import { TENANT_AUTHORIZE_METADATA_KEY } from '../../middleware/tenantAuthorize';

export interface IRouteGroup {
    prefix: string;
    routes: IRoute[];
}

interface RouteMetadata {
    method: IRoute['method'];
    path: string;
    propertyKey: string;
    bodySchema?: ZodType;
    querySchema?: ZodType;
    paramsSchema?: ZodType;
    headersSchema?: ZodType;
    authorizeMetadata?: Record<string, unknown>;
    internalOnlyMetadata?: Record<string, unknown>;
    tenantAuthorizeMetadata?: Record<string, unknown>;
}

const ROUTES_KEY = Symbol('controller:routes');
const MIDDLEWARES_KEY = Symbol('controller:middlewares');

function getRoutesMetadata(target: object): RouteMetadata[] {
    return (target.constructor as unknown as Record<symbol, RouteMetadata[]>)[ROUTES_KEY] || [];
}

function addRouteMetadata(target: object, metadata: RouteMetadata): void {
    const targetConstructor = target.constructor as unknown as Record<symbol, RouteMetadata[]>;

    if (!targetConstructor[ROUTES_KEY]) {
        targetConstructor[ROUTES_KEY] = [];
    }

    targetConstructor[ROUTES_KEY].push(metadata);
}

function getMiddlewaresMetadata(target: object): Record<string, NonNullable<IRoute['middleware']>> {
    return (target.constructor as unknown as Record<symbol, Record<string, NonNullable<IRoute['middleware']>>>)[MIDDLEWARES_KEY] || {};
}

function addMiddlewaresMetadata(target: object, propertyKey: string, middlewares: NonNullable<IRoute['middleware']>): void {
    const targetConstructor = target.constructor as unknown as Record<symbol, Record<string, NonNullable<IRoute['middleware']>>>;

    if (!targetConstructor[MIDDLEWARES_KEY]) {
        targetConstructor[MIDDLEWARES_KEY] = {};
    }

    targetConstructor[MIDDLEWARES_KEY][propertyKey] = middlewares;
}

function getAuthorizeMetadata(target: object): Record<string, Record<string, unknown>> {
    return (target.constructor as unknown as Record<symbol, Record<string, Record<string, unknown>>>)[AUTHORIZE_METADATA_KEY] || {};
}

function getInternalOnlyMetadata(target: object): Record<string, Record<string, unknown>> {
    return (target.constructor as unknown as Record<symbol, Record<string, Record<string, unknown>>>)[INTERNAL_ONLY_METADATA_KEY] || {};
}

function getTenantAuthorizeMetadata(target: object): Record<string, Record<string, unknown>> {
    return (target.constructor as unknown as Record<symbol, Record<string, Record<string, unknown>>>)[TENANT_AUTHORIZE_METADATA_KEY] || {};
}

/**
 * Opções do decorator de rota com schemas tipados
 */
export interface RouteDecoratorOptions<
    TBody extends ZodType = ZodType,
    TQuery extends ZodType = ZodType,
    TParams extends ZodType = ZodType,
> {
    bodySchema?: TBody;
    querySchema?: TQuery;
    paramsSchema?: TParams;
}

/**
 * Cria um decorator de método HTTP tipado
 */
function createMethodDecorator(method: IRoute['method']) {
    return function <
        TBody extends ZodType = ZodType<unknown>,
        TQuery extends ZodType = ZodType<unknown>,
        TParams extends ZodType = ZodType<unknown>,
    >(
        path = '/',
        options?: RouteDecoratorOptions<TBody, TQuery, TParams>
    ): MethodDecorator {
        return function (
            target: object,
            propertyKey: string | symbol,
            descriptor: PropertyDescriptor
        ): PropertyDescriptor | void {
            addRouteMetadata(target, {
                method,
                path,
                propertyKey: String(propertyKey),
                bodySchema: options?.bodySchema,
                querySchema: options?.querySchema,
                paramsSchema: options?.paramsSchema,
            });

            return descriptor;
        };
    };
}

/**
 * Decorators para definir rotas
 */
export const Get = createMethodDecorator('get');
export const Post = createMethodDecorator('post');
export const Put = createMethodDecorator('put');
export const Patch = createMethodDecorator('patch');
export const Delete = createMethodDecorator('delete');

/**
 * Decorator para adicionar middlewares a uma rota
 *
 * @example
 * @Middlewares([middleware1, middleware2])
 */
export function Middlewares(middlewares: NonNullable<IRoute['middleware']>): MethodDecorator {
    return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor | void => {
        addMiddlewaresMetadata(target, String(propertyKey), middlewares);
        return descriptor;
    };
}

/**
 * Re-exporta TypedRequest e InferSchema para uso nos controllers
 */
export type { TypedRequest, InferSchema };

/**
 * Helper types para Request tipado
 */
export type Req<TBody = unknown, TQuery = unknown, TParams = unknown> = TypedRequest<TBody, TQuery, TParams>;
export type ReqBody<T> = TypedRequest<T, unknown, unknown>;
export type ReqQuery<T> = TypedRequest<unknown, T, unknown>;
export type ReqParams<T> = TypedRequest<unknown, unknown, T>;
export type ReqBodyParams<TBody, TParams> = TypedRequest<TBody, unknown, TParams>;
export type ReqBodyQuery<TBody, TQuery> = TypedRequest<TBody, TQuery, unknown>;
export type ReqQueryParams<TQuery, TParams> = TypedRequest<unknown, TQuery, TParams>;
export type Res = Response;

/**
 * Builder para criar rotas com tipagem automática
 */
class RouteBuilder<
    TBody = unknown,
    TQuery = unknown,
    TParams = unknown,
> {
    private _bodySchema?: ZodType;
    private _querySchema?: ZodType;
    private _paramsSchema?: ZodType;
    private _headersSchema?: ZodType;
    private _middleware: NonNullable<IRoute['middleware']> = [];

    constructor(
        private readonly _method: IRoute['method'],
        private readonly _path: string
    ) { }

    /**
     * Define o schema de validação do body
     */
    body<T extends ZodType>(schema: T): RouteBuilder<output<T>, TQuery, TParams> {
        this._bodySchema = schema;
        return this as unknown as RouteBuilder<output<T>, TQuery, TParams>;
    }

    /**
     * Define o schema de validação da query string
     */
    query<T extends ZodType>(schema: T): RouteBuilder<TBody, output<T>, TParams> {
        this._querySchema = schema;
        return this as unknown as RouteBuilder<TBody, output<T>, TParams>;
    }

    /**
     * Define o schema de validação dos params da URL
     */
    params<T extends ZodType>(schema: T): RouteBuilder<TBody, TQuery, output<T>> {
        this._paramsSchema = schema;
        return this as unknown as RouteBuilder<TBody, TQuery, output<T>>;
    }

    /**
     * Define o schema de validação dos headers
     */
    headers(schema: ZodType): this {
        this._headersSchema = schema;
        return this;
    }

    /**
     * Adiciona middleware à rota
     */
    middleware(...handlers: NonNullable<IRoute['middleware']>): this {
        this._middleware.push(...handlers);
        return this;
    }

    /**
     * Define o handler da rota com tipos inferidos automaticamente
     */
    handle(
        handler: (
            req: TypedRequest<TBody, TQuery, TParams>,
            res: Response,
            next: NextFunction
        ) => Promise<void> | void
    ): IRoute {
        return {
            method: this._method,
            path: this._path,
            handler: handler as IRoute['handler'],
            bodySchema: this._bodySchema,
            querySchema: this._querySchema,
            paramsSchema: this._paramsSchema,
            headersSchema: this._headersSchema,
            middleware: this._middleware.length > 0 ? this._middleware : undefined,
        };
    }
}

/**
 * Controller base com suporte a múltiplas rotas e tipagem automática
 *
 * @example
 * ```typescript
 * // Com decorators:
 * class UserController extends BaseController {
 *     readonly basePath = '/users';
 *
 *     @Get('/')
 *     list(req: Req, res: Res) {
 *         res.json({ users: [] });
 *     }
 *
 *     @Post('/', { bodySchema: createUserSchema })
 *     create(req: ReqBody<z.infer<typeof createUserSchema>>, res: Res) {
 *         // req.body é automaticamente tipado!
 *         res.json({ name: req.body.name });
 *     }
 *
 *     @Get('/:id', { paramsSchema: z.object({ id: z.string() }) })
 *     getById(req: ReqParams<{ id: string }>, res: Res) {
 *         // req.params.id é tipado como string
 *         res.json({ id: req.params.id });
 *     }
 *
 *     @Put('/:id', { bodySchema: updateUserSchema, paramsSchema: z.object({ id: z.string() }) })
 *     update(req: ReqBodyParams<z.infer<typeof updateUserSchema>, { id: string }>, res: Res) {
 *         // req.body e req.params são tipados!
 *         res.json({ id: req.params.id, ...req.body });
 *     }
 * }
 * ```
 */
export abstract class BaseController {
    private static _instances: BaseController[] = [];

    constructor() {
        BaseController._instances.push(this);
    }

    abstract readonly basePath: string;

    /**
     * Cria um builder para rota GET
     */
    protected get(path: string): RouteBuilder {
        return new RouteBuilder('get', path);
    }

    /**
     * Cria um builder para rota POST
     */
    protected post(path: string): RouteBuilder {
        return new RouteBuilder('post', path);
    }

    /**
     * Cria um builder para rota PUT
     */
    protected put(path: string): RouteBuilder {
        return new RouteBuilder('put', path);
    }

    /**
     * Cria um builder para rota PATCH
     */
    protected patch(path: string): RouteBuilder {
        return new RouteBuilder('patch', path);
    }

    /**
     * Cria um builder para rota DELETE
     */
    protected delete(path: string): RouteBuilder {
        return new RouteBuilder('delete', path);
    }

    /**
     * Retorna rotas definidas manualmente
     */
    getRoutes(): IRoute[] {
        return [];
    }

    /**
     * Retorna grupos de rotas
     */
    getRouteGroups(): IRouteGroup[] {
        return [];
    }

    /**
     * Retorna todas as rotas (manuais + decorators + grupos)
     */
    buildRoutes(): IRoute[] {
        const manualRoutes = this.getRoutes().map((route) => ({
            ...route,
            path: this.normalizePath(this.basePath, route.path),
        }));

        const decoratorRoutes = this.buildDecoratorRoutes();

        const groupedRoutes = this.getRouteGroups().flatMap((group) =>
            group.routes.map((route) => ({
                ...route,
                path: this.normalizePath(this.basePath, this.normalizePath(group.prefix, route.path)),
            }))
        );

        return [...manualRoutes, ...decoratorRoutes, ...groupedRoutes];
    }

    private buildDecoratorRoutes(): IRoute[] {
        const metadata = getRoutesMetadata(this);
        const authorizeMetadata = getAuthorizeMetadata(this);
        const internalOnlyMetadata = getInternalOnlyMetadata(this);
        const tenantAuthorizeMetadata = getTenantAuthorizeMetadata(this);
        const middlewaresMetadata = getMiddlewaresMetadata(this);

        return metadata.map((meta) => {
            const handler = (this as unknown as Record<string, IRoute['handler'] | undefined>)[meta.propertyKey];

            if (!handler) {
                throw new Error(`Handler not found for route: ${meta.propertyKey}`);
            }

            return {
                method: meta.method,
                path: this.normalizePath(this.basePath, meta.path),
                handler: handler.bind(this),
                bodySchema: meta.bodySchema,
                querySchema: meta.querySchema,
                paramsSchema: meta.paramsSchema,
                headersSchema: meta.headersSchema,
                middleware: middlewaresMetadata[meta.propertyKey],
                authorizeMetadata: authorizeMetadata[meta.propertyKey],
                internalOnlyMetadata: internalOnlyMetadata[meta.propertyKey],
                tenantAuthorizeMetadata: tenantAuthorizeMetadata[meta.propertyKey],
            };
        });
    }

    protected group(prefix: string, routes: IRoute[]): IRouteGroup {
        return { prefix, routes };
    }

    private normalizePath(basePath: string, routePath: string): string {
        const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const path = routePath.startsWith('/') ? routePath : `/${routePath}`;
        return `${base}${path}`;
    }

    static getRegisteredInstances(): BaseController[] {
        return BaseController._instances;
    }
}