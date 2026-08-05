export {
    BaseController,
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
} from './BaseController';

export {
    DomainError,
    NotFoundError,
    ConflictError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
} from './DomainError';
