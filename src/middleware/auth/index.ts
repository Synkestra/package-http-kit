/**
 * Módulo de autenticação e autorização
 *
 * Este módulo fornece validação de tokens JWT, verificação de permissões
 * e proteções contra vulnerabilidades de segurança.
 */

// Tipos
export * from "./types.js";

// Validadores de Token
export {
    isValidCredentialPayload,
    isValidUserPayload,
    validateTokenPayload,
    extractBearerToken,
    verifyAndValidateToken,
} from "./validators/token-validator.js";

// Validadores de Header
export {
    sanitizeTenantId,
} from "./validators/header-validator.js";

// Utilitários de Segurança
export {
    timingSafePermissionCheck,
    secureHash,
    maskSensitiveData,
} from "./utils/security.js";
