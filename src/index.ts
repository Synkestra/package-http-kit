export { ExpressAdapter } from './adapter/ExpressAdapter';
export { BaseController } from './shared/abstracts/BaseController';
export {
    DomainError,
    NotFoundError,
    ConflictError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
} from './shared/abstracts/DomainError';
export { ErrorHandler } from './handler/ErrorHandler';
export { ValidationProblemDetails } from './handler/ValidationProblemDetails';

// Decorators e tipos do BaseController
export {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Middlewares,
    type IRouteGroup,
    type RouteDecoratorOptions,
    type Req,
    type ReqBody,
    type ReqQuery,
    type ReqParams,
    type ReqBodyParams,
    type ReqBodyQuery,
    type ReqQueryParams,
    type Res,
} from './shared/abstracts/BaseController';

export {
    type FlatPermission,
    PermissionAction,
    PermissionResource,
    PermissionSubResource,
    type PermissionTree,
    type ResourceKey,
    type ResourcesWithSubs,
} from "./shared/permission/PermissionConfig";

export {
    PermissionManager,
} from "./shared/permission/PermissionManager";

export {
    PermissionUtils
} from "./shared/permission/PermissionUtils";

export {
    MetricsManager,
    metricsMiddleware,
    type MetricsConfig,
} from "./metrics/index";

export {
    createFlatPermissionSchema
} from "./shared/utils/createFlatPermissionSchema";

export { applyDomainValidation } from "./shared/utils/applyDomainValidation";

export {
    type ProblemDetails,
    type ValidationProblemDetails as SharedValidationProblemDetails,
    type ValidationError,
    ProblemTypes,
    createProblemDetails,
    createValidationProblemDetails,
} from "./shared/utils/ProblemDetails";

// Errors
export * from "./shared/errors";

// Types
export {
    type TypedRequest,
    type InferSchema,
    type TypedHandler,
    type TypedRouteConfig,
    type IRoute,
    type IMiddleware,
    type IErrorHandler,
    type IExpressAdapterConfig,
    type ILogger,
    type IController,
    route,
} from './types/index';

// Middleware
export {
    Authorize,
    authorize,
    getAuthorizeMetadata,
    AUTHORIZE_METADATA_KEY,
    AuthType,
    type AuthorizeOptions,
    type AuthorizedReq,
    type AuthorizeContext,
    type CredentialTokenPayload,
    type UserTokenPayload,
    type TokenPayload,
} from './middleware/authorize';

export {
    TenantAuthorize,
    tenantAuthorize,
    getTenantAuthorizeMetadata,
    TENANT_AUTHORIZE_METADATA_KEY,
    type TenantAuthorizeOptions,
    type TenantAuthorizedReq,
    type TenantAuthorizeContext,
} from './middleware/tenantAuthorize';

export {
    InternalOnly,
    internalOnly,
    getInternalOnlyMetadata,
    INTERNAL_ONLY_METADATA_KEY,
    type InternalOnlyOptions,
} from './middleware/internalOnly';

export {
    isValidCredentialPayload,
    isValidUserPayload,
    validateTokenPayload,
    extractBearerToken,
    verifyAndValidateToken,
    sanitizeTenantId,
    timingSafePermissionCheck,
    secureHash,
    maskSensitiveData,
} from './middleware/auth';