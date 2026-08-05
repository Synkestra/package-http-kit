import type { FlatPermission, PermissionAction, PermissionTree } from "./PermissionConfig";
import { PermissionSubResource } from "./PermissionConfig";

type Brand<T, B> = T & { __brand: B };
export type Resource = Brand<string, "Resource">;
export type SubResource = Brand<string, "SubResource">;

export class PermissionManager {
    private readonly flatPermissions: Set<FlatPermission>;

    constructor(tree: PermissionTree) {
        this.flatPermissions = new Set(PermissionManager.flatten(tree));
    }

    private static getResourcesWithSubResources(): Record<string, string[]> {
        const result: Record<string, string[]> = {};

        for (const [resource, subResources] of Object.entries(PermissionSubResource)) {
            if (Object.keys(subResources).length > 0) {
                result[resource] = Object.keys(subResources);
            }
        }

        return result;
    }

    static flatten(tree: PermissionTree): FlatPermission[] {
        const result: FlatPermission[] = [];
        const resourcesWithSubs = PermissionManager.getResourcesWithSubResources();

        // 🔥 TRATA WILDCARD "*" na tree
        if (Array.isArray(tree) && tree.includes("*")) {
            return ["*"];
        }

        for (const [resource, value] of Object.entries(tree as any)) {
            if (Array.isArray(value)) {
                value.forEach(action => {
                    result.push(`${resource}:${action}` as FlatPermission);
                });
            }
            else if (resourcesWithSubs[resource] && value && typeof value === 'object') {
                for (const [subResource, actions] of Object.entries(value)) {
                    (actions as PermissionAction[]).forEach(action => {
                        result.push(`${resource}:${subResource}:${action}` as FlatPermission);
                    });
                }
            }
        }

        return Array.from(new Set(result));
    }

    all(): FlatPermission[] {
        return Array.from(this.flatPermissions);
    }

    has(permission: FlatPermission): boolean {
        if (this.flatPermissions.has("*")) return true;

        const parts = permission.split(":");
        const resource = parts[0];
        const action = parts[1];

        // 🔹 Caso especial: WRITE implica READ
        if (action === "READ" && this.flatPermissions.has(`${resource}:WRITE` as FlatPermission)) {
            return true;
        }

        // Wildcard progressivo com suporte a *:*
        for (let i = parts.length; i > 0; i--) {
            const wildcard = parts.slice(0, i).join(":") + ":*";
            if (this.flatPermissions.has(wildcard as FlatPermission)) return true;
        }

        // Permissão direta
        return this.flatPermissions.has(permission);
    }

    toJSON(): FlatPermission[] {
        return this.all();
    }

    static fromJSON(perms: FlatPermission[]): PermissionManager {
        // 🔥 PASSO 1: Otimização de wildcards
        const wildcards: string[] = [];
        const specifics: string[] = [];

        for (const perm of Array.from(new Set(perms))) {
            if (perm === "*" || perm.endsWith(":*")) {
                wildcards.push(perm);
            } else {
                specifics.push(perm);
            }
        }

        // 🔥 PASSO 2: Remove redundâncias
        const relevantSpecifics = specifics.filter(specific => {
            for (const wildcard of wildcards) {
                const wildcardPrefix = wildcard.slice(0, -1);   // Remove ":*"
                if (specific.startsWith(wildcardPrefix)) {
                    return false;                                        // Redundante!
                }
            }
            return true;
        });

        // 🔥 PASSO 3: Reconstrói array otimizado
        const optimizedPerms = [...wildcards, ...relevantSpecifics];

        // 🔥 PASSO 4: Cria TREE otimizada e passa pro constructor
        const tree: any = {};
        const resourcesWithSubs = PermissionManager.getResourcesWithSubResources();

        for (const perm of optimizedPerms) {
            const parts = perm.split(":");

            if (perm === "*") {
                // Wildcard total - retorna direto
                const manager = new PermissionManager({} as any);
                (manager as any).flatPermissions.add("*");
                return manager;
            }

            if (parts.length === 2 && parts[1] === "*") {
                // RESOURCE:*
                const [resource] = parts;
                if (!resource) continue;
                tree[resource] = ["*"];
            }
            else if (parts.length === 2) {
                // RESOURCE:ACTION
                const [resource, action] = parts;
                if (!resource) continue;
                tree[resource] ??= [];
                tree[resource].push(action as PermissionAction);
            }
            else if (parts.length === 3 && parts[2] === "*") {
                // RESOURCE.SUB:*
                const [resource, subResource] = parts;
                if (!resource || !subResource) continue;
                tree[resource] ??= {};
                tree[resource][subResource] = ["*"];
            }
            else if (parts.length === 3) {
                // RESOURCE.SUB:ACTION
                const [resource, subResource, action] = parts;
                if (!resource || !subResource || !resourcesWithSubs[resource]) continue;
                tree[resource] ??= {};
                tree[resource][subResource] ??= [];
                tree[resource][subResource].push(action as PermissionAction);
            }
        }

        return new PermissionManager(tree);
    }
}
