import { z } from "zod";

type DomainFactory<T> = (value: unknown) => T;

export function applyDomainValidation<T>(
    ctx: z.RefinementCtx,
    factory: DomainFactory<T>,
    value: unknown,
    fallbackMessage = "Invalid value"
): void {
    try {
        const result = factory(value);

        // Caso o factory use Either
        if (typeof result === "object" && result !== null && "isFailure" in result) {
            // opcional, se você tiver um helper isFailure global
            // throw result.left;
        }
    } catch (err) {
        if (err instanceof z.ZodError) {
            err.issues.forEach((issue) => {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: issue.message,
                    path: issue.path,
                });
            });
        } else if (Array.isArray(err)) {
            // Caso domínio retorne lista de erros
            err.forEach((issue) => {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: issue.message ?? fallbackMessage,
                    path: issue.path,
                });
            });
        } else {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: fallbackMessage,
            });
        }
    }
}

export function refineWithValueObject<T>(
    ctx: z.RefinementCtx,
    value: unknown,
    factory: (value: unknown) => T,
    fallbackMessage: string
) {
    applyDomainValidation(ctx, factory, value, fallbackMessage);
}
