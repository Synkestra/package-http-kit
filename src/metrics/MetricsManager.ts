import client, {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics,
} from 'prom-client';

export interface MetricsConfig {
    /** Prefixo para todas as métricas (ex: 'myapp_') */
    prefix?: string;
    /** Habilitar métricas padrão do Node.js (CPU, memória, event loop, etc.) */
    defaultMetrics?: boolean;
    /** Labels padrão aplicados a todas as métricas */
    defaultLabels?: Record<string, string>;
    /** Buckets customizados para o histograma de duração HTTP (em segundos) */
    httpDurationBuckets?: number[];
}

export class MetricsManager {
    private readonly registry: Registry;
    private readonly prefix: string;

    public readonly httpRequestDuration: Histogram;
    public readonly httpRequestsTotal: Counter;
    public readonly httpActiveRequests: Gauge;

    constructor(config: MetricsConfig = {}) {
        this.registry = new Registry();
        this.prefix = config.prefix ?? '';

        if (config.defaultLabels) {
            this.registry.setDefaultLabels(config.defaultLabels);
        }

        if (config.defaultMetrics !== false) {
            collectDefaultMetrics({
                register: this.registry,
                prefix: this.prefix,
            });
        }

        this.httpRequestDuration = new Histogram({
            name: `${this.prefix}http_request_duration_seconds`,
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status_code'] as const,
            buckets: config.httpDurationBuckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
            registers: [this.registry],
        });

        this.httpRequestsTotal = new Counter({
            name: `${this.prefix}http_requests_total`,
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status_code'] as const,
            registers: [this.registry],
        });

        this.httpActiveRequests = new Gauge({
            name: `${this.prefix}http_active_requests`,
            help: 'Number of active HTTP requests',
            labelNames: ['method'] as const,
            registers: [this.registry],
        });
    }

    /** Retorna o Registry do Prometheus */
    getRegistry(): Registry {
        return this.registry;
    }

    /** Retorna as métricas serializadas no formato Prometheus */
    async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    /** Content-Type para o endpoint /metrics */
    getContentType(): string {
        return this.registry.contentType;
    }

    /** Cria um Counter customizado já registrado */
    createCounter(name: string, help: string, labelNames: string[] = []): Counter {
        return new Counter({
            name: `${this.prefix}${name}`,
            help,
            labelNames,
            registers: [this.registry],
        });
    }

    /** Cria um Histogram customizado já registrado */
    createHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram {
        return new Histogram({
            name: `${this.prefix}${name}`,
            help,
            labelNames,
            buckets,
            registers: [this.registry],
        });
    }

    /** Cria um Gauge customizado já registrado */
    createGauge(name: string, help: string, labelNames: string[] = []): Gauge {
        return new Gauge({
            name: `${this.prefix}${name}`,
            help,
            labelNames,
            registers: [this.registry],
        });
    }
}
