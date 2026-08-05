import { DomainError } from "../../abstracts/DomainError";
import { ProblemTypes, type ProblemDetails } from "../../utils/ProblemDetails";

export class AccountInactiveError extends DomainError {
    readonly code = "ACCOUNT_INACTIVE";
    readonly statusCode = 403;

    constructor() {
        super("This account is inactive or blocked");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.FORBIDDEN}/account-inactive`,
            title: "Account Inactive",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class AuthTenantIdError extends DomainError {
    readonly code = "AUTH_TENANT_ID_INVALID";
    readonly statusCode = 400;

    constructor(message = "X-Client-ID header is required") {
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.BAD_REQUEST}/auth-tenant-id`,
            title: "Invalid Tenant ID",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class AuthTenantForbiddenError extends DomainError {
    readonly code = "AUTH_TENANT_FORBIDDEN";
    readonly statusCode = 403;

    constructor(message = "Tenant is not authorized to proceed") {
        super(message);
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.FORBIDDEN}/auth-tenant`,
            title: "Forbidden",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
