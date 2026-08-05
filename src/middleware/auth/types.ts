import type { FlatPermission } from "../../shared/permission/PermissionConfig.js";

/**
 * Tipos de autenticação suportados
 */
export enum AuthType {
    PASSWORD = "PASSWORD",
    CREDENTIAL = "CREDENTIAL",
}

/**
 * Payload do token JWT para autenticação por credenciais (ClientSecret)
 */
export interface CredentialTokenPayload {
    tenantId: string;
    clientId: string;
    authType: AuthType.CREDENTIAL;
    type: "ACCESS";
    jti: string;
    iat: number;
    exp: number;
}

/**
 * Payload do token JWT para autenticação por usuário
 */
export interface UserTokenPayload {
    customerId: string;
    tenantId?: string;
    authType?: AuthType.PASSWORD;
    iat: number;
    exp: number;
    [key: string]: any;
}

export type TokenPayload = CredentialTokenPayload | UserTokenPayload;

/**
 * Opções para configuração do middleware de autorização
 */
export interface AuthorizeOptions {
    roles?: string[];            // Lista de roles necessárias
    permissions?: FlatPermission[];      // Lista de permissões necessárias
    required?: boolean;          // Se a autorização é obrigatória
    jwtSecret?: string;          // JWT Secret para validação do token
}

/**
 * Propriedades adicionadas pelo middleware de autorização ao Request
 */
export interface AuthorizeContext {
    customerId: string;
    tenantId: string;
    permissions: FlatPermission[];
    authType?: AuthType;
    clientId?: string;
}
