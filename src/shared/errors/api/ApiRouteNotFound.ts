import { DomainError } from "../../abstracts/DomainError";
import { type ProblemDetails, ProblemTypes } from "../../utils/ProblemDetails";

export class ApiRouteNotFound extends DomainError {
    readonly code = "API_ROUTE_NOT_FOUND";
    readonly statusCode = 404;

    constructor() {
        super("API route not found");
    }

    override toProblemDetails(instance?: string): ProblemDetails {
        return {
            type: `${ProblemTypes.NOT_FOUND}/api-route-not-found`,
            title: "API Route Not Found",
            status: this.statusCode,
            detail: this.message,
            instance,
        };
    }
}
