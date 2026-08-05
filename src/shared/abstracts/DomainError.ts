import { ProblemTypes, type ProblemDetails } from "../utils/ProblemDetails";

export abstract class DomainError extends Error {
    abstract readonly code: string;
    abstract readonly statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }

    toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.DOMAIN_ERROR,
            title: this.code,
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class NotFoundError extends DomainError {
    readonly code = "NOT_FOUND";
    readonly statusCode = 404;

    constructor(resource: string, identifier?: string) {
        const message = identifier
            ? `${resource} with identifier '${identifier}' was not found`
            : `${resource} was not found`;
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.NOT_FOUND,
            title: "Resource Not Found",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
export class ConflictError extends DomainError {
    readonly code = "CONFLICT";
    readonly statusCode = 409;

    constructor(message: string) {
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.CONFLICT,
            title: "Conflict",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class BadRequestError extends DomainError {
    readonly code = "BAD_REQUEST";
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.BAD_REQUEST,
            title: "Bad Request",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
export class UnauthorizedError extends DomainError {
    readonly code = "UNAUTHORIZED";
    readonly statusCode = 401;

    constructor(message = "Authentication is required") {
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.UNAUTHORIZED,
            title: "Unauthorized",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
export class ForbiddenError extends DomainError {
    readonly code = "FORBIDDEN";
    readonly statusCode = 403;

    constructor(message = "Access to this resource is forbidden") {
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.FORBIDDEN,
            title: "Forbidden",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
