import { DomainError } from "../../abstracts/DomainError";
import { ProblemTypes, type ProblemDetails } from "../../utils/ProblemDetails";

export class TokenExpiredError extends DomainError {
    readonly code = "TOKEN_EXPIRED";
    readonly statusCode = 401;

    constructor(tokenType: "access" | "refresh" = "access") {
        super(`The ${tokenType} token has expired`);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.UNAUTHORIZED}/token-expired`,
            title: "Token Expired",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class TokenInvalidError extends DomainError {
    readonly code = "TOKEN_INVALID";
    readonly statusCode = 401;

    constructor(reason?: string) {
        super(reason ?? "The provided token is invalid");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.UNAUTHORIZED}/token-invalid`,
            title: "Invalid Token",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class TokenRevokedError extends DomainError {
    readonly code = "TOKEN_REVOKED";
    readonly statusCode = 401;

    constructor() {
        super("The token has been revoked");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.UNAUTHORIZED}/token-revoked`,
            title: "Token Revoked",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class RefreshTokenNotFoundError extends DomainError {
    readonly code = "REFRESH_TOKEN_NOT_FOUND";
    readonly statusCode = 401;

    constructor() {
        super("Refresh token not found");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.UNAUTHORIZED}/refresh-token-not-found`,
            title: "Refresh Token Not Found",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class RefreshTokenRevokedError extends DomainError {
    readonly code = "REFRESH_TOKEN_REVOKED";
    readonly statusCode = 401;

    constructor() {
        super("Refresh token revoked");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.UNAUTHORIZED}/refresh-token-revoked`,
            title: "Refresh Token Revoked",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
