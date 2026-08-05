import { DomainError } from "../../abstracts/DomainError";
import { type ProblemDetails, ProblemTypes } from "../../utils/ProblemDetails";

export class AuthLevelPermissionError extends DomainError {
    readonly code: string;
    readonly statusCode = 403;

    constructor(
        message = "User does not have required permissions",
        code = "INSUFFICIENT_PERMISSIONS"
    ) {
        super(message);
        this.code = code;
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
