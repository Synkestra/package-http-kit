import crypto from "crypto";
import type { FlatPermission } from "../../../shared/permission/PermissionConfig.js";

/**
 * Verifica se uma permissão do usuário (possivelmente wildcard) cobre uma permissão requerida.
 *
 * Wildcards suportados:
 *  - "*"             → cobre qualquer permissão
 *  - "RESOURCE:*"    → cobre "RESOURCE:READ", "RESOURCE:WRITE", etc.
 *  - "RESOURCE.SUB:*"→ cobre "RESOURCE.SUB:READ", "RESOURCE.SUB:WRITE", etc.
 */
function wildcardCovers(userPerm: string, requiredPerm: string): boolean {
    if (userPerm === "*") return true;

    if (userPerm.endsWith(":*")) {
        // "RESOURCE:" ou "RESOURCE.SUB:"
        const prefix = userPerm.slice(0, -1); // remove o "*", mantém o ":"
        return requiredPerm.startsWith(prefix);
    }

    return false;
}

/**
 * Comparação timing-safe de arrays de permissões com suporte a wildcards.
 *
 * Para cada permissão requerida, verifica:
 *  1. Match exato via timing-safe comparison
 *  2. Se alguma permissão wildcard do usuário cobre a requerida
 *
 * Mantém tempo constante de execução iterando todas as permissões do usuário
 * mesmo após encontrar correspondência, impedindo timing attacks.
 *
 * @param required - Lista de permissões requeridas
 * @param userPermissions - Lista de permissões do usuário (já pode conter wildcards)
 * @returns true se o usuário possui todas as permissões requeridas
 */
export function timingSafePermissionCheck(required: FlatPermission[], userPermissions: FlatPermission[]): boolean {
    let hasAll = true;

    for (const requiredPerm of required) {
        let found = false;

        for (const userPerm of userPermissions) {
            // 1) Verifica cobertura por wildcard
            if (wildcardCovers(userPerm, requiredPerm)) {
                found = true;
                // NÃO dá break — mantém tempo constante
            }

            // 2) Match exato timing-safe
            const maxLength = Math.max(requiredPerm.length, userPerm.length);
            const requiredBuffer = Buffer.from(requiredPerm.padEnd(maxLength));
            const userBuffer = Buffer.from(userPerm.padEnd(maxLength));

            try {
                const match = crypto.timingSafeEqual(requiredBuffer, userBuffer);
                if (match) {
                    found = true;
                }
            } catch {
                continue;
            }
        }

        if (!found) {
            hasAll = false;
        }
    }

    return hasAll;
}

/**
 * Gera um hash seguro de uma string usando SHA-256
 * Útil para logging seguro de informações sensíveis
 *
 * @param input - String a ser hasheada
 * @returns Hash hexadecimal da string
 */
export function secureHash(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Mascara informações sensíveis para logging
 * Mostra apenas os primeiros e últimos caracteres
 *
 * @param value - Valor a ser mascarado
 * @param visibleChars - Número de caracteres visíveis em cada extremidade
 * @returns String mascarada
 */
export function maskSensitiveData(value: string, visibleChars: number = 4): string {
    if (!value || value.length <= visibleChars * 2) {
        return "***";
    }

    const start = value.substring(0, visibleChars);
    const end = value.substring(value.length - visibleChars);
    return `${start}***${end}`;
}
