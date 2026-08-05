import { DomainError } from "../../abstracts/DomainError";
import { ProblemTypes, type ProblemDetails } from "../../utils/ProblemDetails";

export class EmailAlreadyExistsError extends DomainError {
    readonly code = "EMAIL_ALREADY_EXISTS";
    readonly statusCode = 409;

    constructor() {
        super("An account with this email already exists");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.CONFLICT}/email-already-exists`,
            title: "Email Already Exists",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class CpfAlreadyExistsError extends DomainError {
    readonly code = "CPF_ALREADY_EXISTS";
    readonly statusCode = 409;

    constructor() {
        super("An account with this CPF already exists");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.CONFLICT}/cpf-already-exists`,
            title: "CPF Already Exists",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}

export class CpfNotFoundError extends DomainError {
    readonly code = "CPF_NOT_FOUND";
    readonly statusCode = 404;

    constructor() {
        super("No account was found with the provided CPF");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.NOT_FOUND}/cpf-not-found`,
            title: "CPF Not Found",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
