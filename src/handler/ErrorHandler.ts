import { ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { DomainError } from '../shared/abstracts/DomainError.js';
import {
    createProblemDetails,
    createValidationProblemDetails,
    ProblemTypes,
} from '../shared/utils/ProblemDetails.js';
import { logger } from '../shared/utils/logger.js';

export const ErrorHandler = {
    handle(error: unknown, req: Request, res: Response, _next: NextFunction): void {
        const traceId =
            (req.headers['x-trace-id'] ||
                req.headers['trace-id'] ||
                undefined) as string | undefined;

        const instance = req.originalUrl;

        if (error instanceof DomainError) {
            const problem = error.toProblemDetails(instance);

            res.status(problem.status)
                .type('application/problem+json')
                .json({
                    ...problem,
                    ...(traceId ? { traceId } : {}),
                });

            return;
        }

        if (error instanceof ZodError) {
            const problem = createValidationProblemDetails(
                error.issues.map(issue => ({
                    field: issue.path.join('.'),
                    message: issue.message,
                    code: issue.code,
                })),
                instance
            );

            res.status(400)
                .type('application/problem+json')
                .json({
                    ...problem,
                    ...(traceId ? { traceId } : {}),
                });
            return;
        }

        if (error instanceof SyntaxError && 'body' in error) {
            const problem = createProblemDetails(400, 'Invalid JSON', {
                type: ProblemTypes.BAD_REQUEST,
                detail: 'Malformed JSON in request body.',
                instance,
                ...(traceId ? { traceId } : {}),
            });

            res.status(400)
                .type('application/problem+json')
                .json(problem);

            return;
        }

        logger.error('Unhandled error', {
            event: 'error',
            traceId,
            method: req.method,
            path: req.originalUrl,
            error,
        });

        const problem = createProblemDetails(500, 'Internal Server Error', {
            type: ProblemTypes.INTERNAL_ERROR,
            detail: 'An unexpected error occurred.',
            instance,
            ...(traceId ? { traceId } : {}),
        });

        res.status(500)
            .type('application/problem+json')
            .json(problem);
    }
}
