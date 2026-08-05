import type { ZodError } from 'zod';

export const ValidationProblemDetails = {
    format(error: ZodError, instance: string, traceId?: string) {
        return {
            type: "https://httpstatuses.com/400",
            title: "Validation Error",
            status: 400,
            detail: "One or more validation errors occurred.",
            instance,
            traceId,
            errors: error.issues.map(issue => ({
                field: issue.path.join("."),
                message: issue.message,
                code: issue.code,
            })),
        };
    },
};