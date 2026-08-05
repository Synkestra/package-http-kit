import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { IRoute, IMiddleware, IExpressAdapterConfig, IController, ILogger } from '../types/index';
import { join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { type Dirent, readdirSync, existsSync, statSync } from 'fs';
import { ApiRouteNotFound } from '../index';
import { authorize, AuthorizeOptions } from '../middleware/authorize';
import { internalOnly, InternalOnlyOptions } from '../middleware/internalOnly';
import { tenantAuthorize, TenantAuthorizeOptions } from '../middleware/tenantAuthorize';
import { BaseController } from '../shared/abstracts/BaseController';
import { ErrorHandler } from '../handler/ErrorHandler';
import { logger } from '../shared/utils/logger';
import { MetricsManager, type MetricsConfig } from '../metrics/MetricsManager';
import { metricsMiddleware } from '../metrics/metricsMiddleware';

export class ExpressAdapter {
    private app: Express;
    private config: Required<Omit<IExpressAdapterConfig, 'logger' | 'metrics'>>;
    private routes: IRoute[] = [];
    private middlewares: IMiddleware[] = [];
    private controllers: IController[] = [];
    private logger: ILogger;
    private metricsManager: MetricsManager | null = null;

    private constructor(config: IExpressAdapterConfig = {}) {
        this.app = express();
        this.logger = config.logger ?? logger;
        this.config = {
            jsonLimit: config.jsonLimit ?? '10mb',
            enableCors: config.enableCors ?? true,
            corsOptions: config.corsOptions ?? { origin: '*', credentials: true },
            logging: config.logging ?? false,
            enableOpenApi: config.enableOpenApi ?? false,
            basePath: config.basePath ?? '',
            metricsPath: config.metricsPath ?? '/metrics',
        };

        if (config.metrics) {
            const metricsConfig: MetricsConfig = config.metrics === true ? {} : config.metrics;
            this.metricsManager = new MetricsManager(metricsConfig);
        }

        this.setupCore();
    }

    /**
     * Padrão Builder - cria nova instância do adapter
     */
    static create(config?: IExpressAdapterConfig): ExpressAdapter {
        return new ExpressAdapter(config);
    }

    /**
     * Configura middleware e handlers core
     */
    private setupCore(): void {
        // JSON parser
        this.app.use(
            express.json({
                limit: this.config.jsonLimit,
                strict: true,
            })
        );

        // CORS
        if (this.config.enableCors) {
            this.app.use(cors(this.config.corsOptions));
        }

        // Prometheus metrics endpoint (registrado antes do middleware para não ser instrumentado)
        if (this.metricsManager) {
            const metricsPath = this.config.metricsPath;
            this.app.get(metricsPath, async (_req: Request, res: Response) => {
                try {
                    const metrics = await this.metricsManager!.getMetrics();
                    res.set('Content-Type', this.metricsManager!.getContentType());
                    res.end(metrics);
                } catch {
                    res.status(500).end();
                }
            });

            const instrumentMiddleware = metricsMiddleware(this.metricsManager);
            this.app.use((req: Request, res: Response, next: NextFunction) => {
                if (req.path === metricsPath) {
                    return next();
                }
                instrumentMiddleware(req, res, next);
            });
        }

        // Request logging
        if (this.config.logging) {
            this.app.use((req: Request, res: Response, next: NextFunction) => {
                const start = process.hrtime.bigint();
                res.on('finish', () => {
                    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
                    const traceId = (req.headers['x-trace-id'] || req.headers['trace-id']) as string | undefined;
                    const forwarded = req.headers['x-forwarded-for'];
                    const forwardedIp = Array.isArray(forwarded)
                        ? forwarded[0]?.split(',')[0]?.trim()
                        : typeof forwarded === 'string'
                            ? forwarded.split(',')[0]?.trim()
                            : undefined;
                    const clientIp = forwardedIp || req.ip || req.socket?.remoteAddress;

                    this.logger.info('Request completed', {
                        event: 'http_request',
                        method: req.method,
                        path: req.originalUrl || req.path,
                        status: res.statusCode,
                        durationMs: Math.round(durationMs * 100) / 100,
                        traceId,
                        ip: clientIp,
                        userAgent: req.headers['user-agent'],
                        tenantId: (req as any).tenantId,
                        customerId: (req as any).customerId,
                        role: (req as any).role,
                    });
                });

                next();
            });
        }

        this.app.use(
            (error: unknown, _req: Request, res: Response, next: NextFunction): void => {
                if (error instanceof SyntaxError && 'body' in error) {
                    res.status(400).json({
                        error: {
                            message: 'Invalid JSON format in request body',
                            code: 'JSON_PARSE_ERROR',
                            status: 400,
                        },
                    });
                    return;
                }

                next(error);
            }
        );
    }

    /**
     * Adiciona middleware customizado
     */
    use(handler: (req: Request, res: Response, next: NextFunction) => void, priority = 0): this {
        this.middlewares.push({ handler, priority });

        // Ordenar por prioridade (maior primeiro)
        this.middlewares.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        this.middlewares.map((m) => this.app.use(m.handler));
        return this;
    }

    /**
     * Adiciona rota única
     */
    addRoute(route: IRoute): this {
        this.checkDuplicateRoute(route);
        this.routes.push(route);
        this.registerRoute(route);
        return this;
    }

    /**
     * Verifica se a rota já existe e lança erro
     */
    private checkDuplicateRoute(route: IRoute): void {
        const duplicate = this.routes.find((r) => r.method === route.method && r.path === route.path);

        if (duplicate) {
            throw new Error(`[ExpressAdapter] Duplicate route detected: ${route.method.toUpperCase()} ${route.path}`);
        }
    }

    /**
     * Adiciona múltiplas rotas
     */
    addRoutes(routes: IRoute[]): this {
        routes.map((route) => this.addRoute(route));
        return this;
    }

    /**
     * Adiciona um controller e registra suas rotas automaticamente
     */
    addController(controller: IController | BaseController): this {
        this.controllers.push(controller);

        // Detecta automaticamente se é um BaseController e extrai suas rotas
        const routes = this.applyControllersBasePath(this.extractRoutesFromController(controller));

        if (routes.length === 0) {
            this.logger.warn(`[ExpressAdapter] Controller "${controller.constructor.name}" has no routes to register`);
        }

        this.addRoutes(routes);
        return this;
    }

    /**
     * Extrai rotas de um controller (compatível com BaseController e IController)
     */
    private extractRoutesFromController(controller: IController | BaseController): IRoute[] {
        // Verifica se o controller tem o método buildRoutes (BaseController ou IController padrão)
        if ('buildRoutes' in controller && typeof controller.buildRoutes === 'function') {
            return controller.buildRoutes();
        }

        // Fallback: se não tiver buildRoutes, retorna array vazio
        this.logger.warn(
            `[ExpressAdapter] Controller "${controller.constructor.name}" does not implement buildRoutes() method`
        );
        return [];
    }

    private applyControllersBasePath(routes: IRoute[]): IRoute[] {
        if (!this.config.basePath) {
            return routes;
        }

        return routes.map((route) => ({
            ...route,
            path: this.normalizePath(this.config.basePath, route.path),
        }));
    }

    /**
     * Adiciona múltiplos controllers
     */
    addControllers(controllers: (IController | BaseController)[]): this {
        controllers.map((controller) => this.addController(controller));
        return this;
    }

    /**
     * Registra rota no express com validação
     */
    private registerRoute(route: IRoute): void {
        const { method, path, handler, bodySchema, querySchema, paramsSchema, headersSchema, middleware = [], authorizeMetadata, internalOnlyMetadata, tenantAuthorizeMetadata } = route;

        // Log da rota sendo registrada
        if (this.config.logging) {
            this.logger.info('Route registered', {
                event: 'route_registered',
                method: method.toUpperCase(),
                path,
            });
        }

        // Prepara middlewares, garantindo que autorização seja o primeiro
        const allMiddlewares = [];

        if (internalOnlyMetadata) {
            const internalMiddleware = internalOnly(internalOnlyMetadata as InternalOnlyOptions);
            allMiddlewares.push(internalMiddleware);
        }

        // Se tiver metadados de autorização de tenant, adiciona como primeiro
        if (tenantAuthorizeMetadata) {
            const tenantAuthMiddleware = tenantAuthorize(tenantAuthorizeMetadata as TenantAuthorizeOptions);
            allMiddlewares.push(tenantAuthMiddleware);
        }

        // Se tiver metadados de autorização, adiciona o middleware de autorização como primeiro
        if (authorizeMetadata) {
            // Usa a função authorize() do arquivo authorize.ts
            const authMiddleware = authorize(authorizeMetadata as AuthorizeOptions);
            allMiddlewares.push(authMiddleware);
        }

        // Adiciona os outros middlewares depois
        allMiddlewares.push(...middleware);

        this.app[method](
            path,
            ...allMiddlewares,
            async (req: Request, res: Response, next: NextFunction) => {
                // const traceId = (req.headers['x-trace-id'] || req.headers['trace-id']) as string | undefined;

                try {
                    // Validações de schema
                    if (bodySchema) {
                        const result = bodySchema.safeParse(req.body);
                        if (!result.success) {
                            throw result.error;
                        }
                        req.body = result.data;
                    }

                    if (querySchema) {
                        const result = querySchema.safeParse(req.query);
                        if (!result.success) {
                            throw result.error;
                        }
                        Object.assign(req.query, result.data as Record<string, string>);
                    }

                    if (paramsSchema) {
                        const result = paramsSchema.safeParse(req.params);
                        if (!result.success) {
                            throw result.error;
                        }
                        req.params = result.data as Record<string, string>;
                    }

                    if (headersSchema) {
                        const result = headersSchema.safeParse(req.headers);
                        if (!result.success) {
                            throw result.error;
                        }
                        Object.assign(req.headers, result.data);
                    }

                    // Executa handler
                    await handler(req, res, next);
                } catch (error) {
                    // Passa erro para handler de erros
                    next(error);
                }
            }
        );
    }

    /**
     * Inicia servidor
     */

    getBasePath(path: string): string {
        const segments = path.split('/').filter(Boolean);
        return segments.length > 0 ? `/${segments[0]}` : '/';
    }

    private normalizePath(basePath: string, routePath: string): string {
        const trimmedBase = basePath.trim();

        if (!trimmedBase || trimmedBase === '/') {
            return routePath.startsWith('/') ? routePath : `/${routePath}`;
        }

        const baseWithSlash = trimmedBase.startsWith('/') ? trimmedBase : `/${trimmedBase}`;
        const base = baseWithSlash.endsWith('/') ? baseWithSlash.slice(0, -1) : baseWithSlash;
        const path = routePath.startsWith('/') ? routePath : `/${routePath}`;

        return `${base}${path}`;
    }

    listen(port: number, host?: string, onListen?: () => void): void {
        const h = host || 'localhost';

        this.app.listen(port, h, () => {
            this.logger.info('Server listening', {
                event: 'server_listen',
                host: h,
                port,
            });

            if (this.routes.length > 0) {
                this.logger.info('Routes registered', {
                    event: 'routes_registered',
                    count: this.routes.length,
                    routes: this.routes.map(({ method, path }) => ({
                        method: method.toUpperCase(),
                        path,
                    })),
                });
            }

            onListen?.();
        });
    }


    /**
     * Retorna app Express
     */
    getApp(): Express {
        return this.app;
    }

    /**
     * Retorna rotas registradas
     */
    getRoutes(): IRoute[] {
        return this.routes;
    }

    /**
     * Retorna controllers registrados
     */
    getControllers(): IController[] {
        return this.controllers;
    }

    /**
     * Retorna o MetricsManager (null se métricas não estão habilitadas)
     */
    getMetricsManager(): MetricsManager | null {
        return this.metricsManager;
    }

    /**
     * Lista todas as rotas registradas (útil para debug)
     */
    printRoutes(): void {
        this.logger.info('Registered routes', {
            event: 'routes_print',
        });
        if (this.routes.length === 0) {
            this.logger.info('No routes registered', {
                event: 'routes_empty',
            });
            return;
        }

        this.routes.forEach((route) => {
            const middlewareCount = route.middleware?.length || 0;
            const middlewareInfo = middlewareCount > 0 ? ` [${middlewareCount} middleware(s)]` : '';
            this.logger.info('Route', {
                event: 'route',
                method: route.method.toUpperCase(),
                path: route.path,
                middlewareCount,
                middlewareInfo,
            });
        });
        this.logger.info('Routes listed', {
            event: 'routes_listed',
            count: this.routes.length,
        });
    }

    /**
     * Correção: Registra middlewares customizados de uma vez só
     * para evitar duplicação no express.use()
     */
    private applyMiddlewares(): void {
        this.middlewares
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .map((m) => this.app.use(m.handler));
    }

    private static readonly SKIP_DIRS = ['request', 'response', 'dto', 'schemas', 'types', 'interfaces'];

    /**
     * Carrega recursivamente todos os controllers de um diretório
     * @param directory - Diretório raiz para buscar controllers
     * @returns Promise<this> para encadeamento fluente
     */
    public async addAllControllers(directory: string): Promise<this> {
        const absoluteDir = resolve(process.cwd(), directory);
        let targetDir = absoluteDir;

        if (!existsSync(targetDir)) {
            const distFallback = absoluteDir.replace(`${sep}src${sep}`, `${sep}dist${sep}`);
            if (distFallback !== absoluteDir && existsSync(distFallback)) {
                targetDir = distFallback;
            } else {
                return this;
            }
        }

        const controllers = await this.loadControllers(targetDir);

        this.logger.info(`[ExpressAdapter] Found ${controllers.length} controller(s)`);

        for (const controller of controllers) {
            this.addController(controller);
        }

        return this;
    }

    /**
     * Carrega controllers de um diretório recursivamente
     * @param dir - Diretório para buscar
     * @returns Array de instâncias de BaseController
     */
    private async loadControllers(dir: string): Promise<BaseController[]> {
        const controllers: BaseController[] = [];
        const files = readdirSync(dir);

        for (const file of files) {
            // Ignorar arquivos de rotas
            if (file === 'routes.ts' || file === 'routes.js') {
                continue;
            }

            const filePath = join(dir, file);
            const stat = statSync(filePath);

            if (stat.isDirectory()) {
                // Ignorar diretórios específicos
                if (ExpressAdapter.SKIP_DIRS.includes(file)) {
                    continue;
                }
                const subControllers = await this.loadControllers(filePath);
                controllers.push(...subControllers);
            } else if (
                stat.isFile() &&
                (file.endsWith('Controller.ts') || file.endsWith('Controller.js'))
            ) {
                try {
                    const fileUrl = pathToFileURL(filePath).href;
                    const module = await import(fileUrl);

                    // O default export pode ser a classe ou uma instância
                    const exported = module.default;

                    if (!exported) {
                        this.logger.warn(`[ExpressAdapter] No default export found in ${filePath}`);
                        continue;
                    }

                    let instance: any;

                    if (typeof exported === 'function') instance = new exported();
                    else if (typeof exported === 'object') instance = exported;
                    else {
                        this.logger.warn(`[ExpressAdapter] Export in ${filePath} is not a controller class or instance`);
                        continue;
                    }

                    if (typeof instance.buildRoutes === 'function') {
                        controllers.push(instance);
                    }
                } catch (error) {
                    this.logger.error(`[ExpressAdapter] Error loading controller ${filePath}`, { error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error });
                }
            }
        }

        return controllers;
    }

    setup(): this {
        this.applyMiddlewares();

        this.app.use((__: Request, _: Response, next: NextFunction) => {
            next(new ApiRouteNotFound());
        });

        this.app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
            ErrorHandler.handle(error, req, res, next);
        });

        return this;
    }
}