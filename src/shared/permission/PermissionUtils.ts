import { PermissionResource, PermissionSubResource, PermissionAction, type FlatPermission } from "./PermissionConfig";

export const PermissionUtils = {
    buildValidPermissions(): Set<FlatPermission> {
        const resources = Object.values(PermissionResource);
        const actions = Object.values(PermissionAction);

        const valid = new Set<FlatPermission>();

        // RESOURCE:ACTION e RESOURCE:*
        for (const r of resources) {
            valid.add(`${r}:*` as FlatPermission);
            for (const a of actions) {
                valid.add(`${r}:${a}` as FlatPermission);
            }
        }

        // RESOURCE.SUB:ACTION e RESOURCE.SUB:*
        for (const [r, subs] of Object.entries(PermissionSubResource)) {
            for (const sub of Object.keys(subs)) {
                for (const a of actions) {
                    valid.add(`${r}.${sub}:${a}` as FlatPermission);
                }
                valid.add(`${r}.${sub}:*` as FlatPermission);
            }
        }

        // Wildcard global
        valid.add("*" as FlatPermission);

        return valid;
    },

    /**
     * Retorna um array com todas as permissões disponíveis (FlatPermissions)
     * ordenadas alfabeticamente
     */
    getAllAvailablePermissions(): FlatPermission[] {
        return Array.from(this.buildValidPermissions()).sort();
    },

    filterValid(permissions: string[]): FlatPermission[] {
        const validSet = this.buildValidPermissions();
        return permissions.filter(p => validSet.has(p as FlatPermission)) as FlatPermission[];
    },

    /**
     * Normaliza um array de permissões removendo redundâncias cobertas por wildcards.
     *
     * Regras:
     *  - Se "*" estiver presente, retorna apenas ["*"]
     *  - Se "RESOURCE:*" existir, remove qualquer "RESOURCE:ACTION"
     *  - Se "RESOURCE.SUB:*" existir, remove qualquer "RESOURCE.SUB:ACTION"
     *
     * @example
     * normalizePermissions(["TENANT:*", "TENANT:READ", "TENANT:WRITE", "MEMBER:READ"])
     * // → ["TENANT:*", "MEMBER:READ"]
     */
    normalizePermissions(permissions: FlatPermission[]): FlatPermission[] {
        const unique = Array.from(new Set(permissions));

        // Wildcard global — tudo é redundante
        if (unique.includes("*" as FlatPermission)) {
            return ["*" as FlatPermission];
        }

        // Coleta todos os wildcards (RESOURCE:* ou RESOURCE.SUB:*)
        const wildcards = unique.filter(p => p.endsWith(":*"));

        // Se não existem wildcards, nada a normalizar
        if (wildcards.length === 0) return unique;

        const result: FlatPermission[] = [...wildcards];

        for (const perm of unique) {
            // Wildcards já estão no resultado
            if (perm.endsWith(":*")) continue;

            // Verifica se algum wildcard cobre essa permissão
            const isCovered = wildcards.some(w => {
                const prefix = w.slice(0, -1); // "RESOURCE:" ou "RESOURCE.SUB:"
                return perm.startsWith(prefix);
            });

            if (!isCovered) {
                result.push(perm);
            }
        }

        return result;
    }
}
