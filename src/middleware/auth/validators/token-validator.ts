import jwt from "jsonwebtoken";
import { AuthType, type CredentialTokenPayload, type UserTokenPayload, type TokenPayload } from "../types.js";

/**
 * Valida se o payload do token possui os campos obrigatórios para credenciais
 */
export function isValidCredentialPayload(payload: any): payload is CredentialTokenPayload {
    return (
        payload &&
        typeof payload === "object" &&
        typeof payload.tenantId === "string" &&
        typeof payload.clientId === "string" &&
        payload.authType === AuthType.CREDENTIAL &&
        payload.type === "ACCESS" &&
        typeof payload.jti === "string" &&
        typeof payload.iat === "number" &&
        typeof payload.exp === "number"
    );
}

/**
 * Valida se o payload do token de usuário possui os campos obrigatórios
 */
export function isValidUserPayload(payload: any): payload is UserTokenPayload {
    return (
        payload &&
        typeof payload === "object" &&
        typeof payload.customerId === "string" &&
        typeof payload.iat === "number" &&
        typeof payload.exp === "number"
    );
}

/**
 * Valida o formato do payload do token
 * @throws {Error} Se o payload não tiver a estrutura esperada
 */
export function validateTokenPayload(payload: any): TokenPayload {
    if (payload.authType === AuthType.CREDENTIAL) {
        if (!isValidCredentialPayload(payload)) {
            throw new Error("Invalid credential token payload structure");
        }
        return payload;
    }

    if (!isValidUserPayload(payload)) {
        throw new Error("Invalid user token payload structure");
    }
    return payload;
}

/**
 * Valida o formato do header Authorization e extrai o token
 * @throws {Error} Se o header não estiver no formato correto
 */
export function extractBearerToken(authHeader: string): string {
    if (!authHeader.startsWith("Bearer ")) {
        throw new Error("Invalid Authorization header format");
    }

    const token = authHeader.substring(7).trim();

    if (!token || token.length === 0) {
        throw new Error("Empty token");
    }

    // Valida formato básico de JWT (3 partes separadas por ponto)
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
    }

    return token;
}

/**
 * Verifica e valida um token JWT
 * @throws {jwt.TokenExpiredError | jwt.JsonWebTokenError | Error}
 */
export function verifyAndValidateToken(token: string, jwtSecret: string): TokenPayload {
    const rawDecoded = jwt.verify(token, jwtSecret);
    return validateTokenPayload(rawDecoded);
}
