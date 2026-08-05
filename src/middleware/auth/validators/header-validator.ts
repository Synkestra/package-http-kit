/**
 * Sanitiza e valida o tenantId do header X-Client-ID
 * Apenas permite valores alfanuméricos, hífens e underscores
 *
 * @param headerValue - Valor do header X-Client-ID
 * @returns Tenant ID sanitizado ou undefined se inválido
 */
export function sanitizeTenantId(headerValue: string | string[] | undefined): string | undefined {
    if (!headerValue) return undefined;

    const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!value || typeof value !== "string") return undefined;

    // Valida formato: apenas alfanuméricos, hífens e underscores, máximo 100 caracteres
    const sanitized = value.trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sanitized)) {
        return undefined;
    }

    return sanitized;
}
