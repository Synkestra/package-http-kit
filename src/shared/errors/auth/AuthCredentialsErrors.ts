import { DomainError } from "../../abstracts/DomainError";
import { ProblemTypes, type ProblemDetails } from "../../utils/ProblemDetails";

export class InvalidCredentialsError extends DomainError {
    readonly code = "INVALID_CREDENTIALS";
    readonly statusCode = 401;

    constructor() {
        super("Invalid email or password");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: ProblemTypes.UNAUTHORIZED,
            title: "Invalid Credentials",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
