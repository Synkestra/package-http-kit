import { DomainError } from "../../abstracts/DomainError";
import { ProblemTypes, type ProblemDetails } from "../../utils/ProblemDetails";

export class TwoFactorRequiredError extends DomainError {
    readonly code = "TWO_FACTOR_REQUIRED";
    readonly statusCode = 403;
    readonly challengeToken: string;

    constructor(challengeToken: string) {
        super("Two-factor authentication is required");
        this.challengeToken = challengeToken;
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.FORBIDDEN}/2fa-required`,
            title: "Two-Factor Authentication Required",
            status: this.statusCode,
            detail: this.message,
            instance,
            challengeToken: this.challengeToken,
        };
    }
}

export class InvalidTotpCodeError extends DomainError {
    readonly code = "INVALID_TOTP_CODE";
    readonly statusCode = 401;

    constructor() {
        super("The provided TOTP code is invalid or expired");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.UNAUTHORIZED}/invalid-totp`,
            title: "Invalid TOTP Code",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class TwoFactorAlreadyEnabledError extends DomainError {
    readonly code = "TWO_FACTOR_ALREADY_ENABLED";
    readonly statusCode = 409;

    constructor() {
        super("Two-factor authentication is already enabled for this account");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.CONFLICT}/2fa-already-enabled`,
            title: "2FA Already Enabled",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class TwoFactorNotEnabledError extends DomainError {
    readonly code = "TWO_FACTOR_NOT_ENABLED";
    readonly statusCode = 400;

    constructor() {
        super("Two-factor authentication is not enabled for this account");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.BAD_REQUEST}/2fa-not-enabled`,
            title: "2FA Not Enabled",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
