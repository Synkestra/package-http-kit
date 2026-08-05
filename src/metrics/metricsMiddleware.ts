import type { Request, Response, NextFunction } from 'express';
import type { MetricsManager } from './MetricsManager';

/**
 * Middleware Express que coleta métricas HTTP automaticamente:
 * - Duração da request (histograma)
 * - Total de requests (counter)
 * - Requests ativas (gauge)
 */
export function metricsMiddleware(metrics: MetricsManager) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const method = req.method;

        metrics.httpActiveRequests.inc({ method });

        const end = metrics.httpRequestDuration.startTimer();

        res.on('finish', () => {
            const route = req.route?.path ?? req.path;
            const statusCode = res.statusCode.toString();

            end({ method, route, status_code: statusCode });
            metrics.httpRequestsTotal.inc({ method, route, status_code: statusCode });
            metrics.httpActiveRequests.dec({ method });
        });

        next();
    };
}
