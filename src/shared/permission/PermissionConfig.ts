import type { Resource, SubResource } from "./PermissionManager";

export enum PermissionAction {
    READ = "READ",
    WRITE = "WRITE",
    DELETE = "DELETE",
    TOGGLE = "TOGGLE",
}

export const PermissionResource = {
    MEMBER: "MEMBER" as Resource,
    INVITE: "INVITE" as Resource,
    TENANT: "TENANT" as Resource,
    WEBHOOK: "WEBHOOK" as Resource,
    CREDENTIAL: "CREDENTIAL" as Resource,
    PAYMENT: "PAYMENT" as Resource,
    FINANCIAL: "FINANCIAL" as Resource,
    ROLE: "ROLE" as Resource,
    REPORT: "REPORT" as Resource,
} as const;

export const PermissionSubResource = {
    CREDENTIAL: {
        WEBHOOK_SECRET: "WEBHOOK_SECRET" as SubResource,
        IP_WHITELIST: "IP_WHITELIST" as SubResource,
        SECRET_KEY: "SECRET_KEY" as SubResource,
    } as const,
    PAYMENT: {
        PIX_IN: "PIX_IN" as SubResource,
        PIX_OUT: "PIX_OUT" as SubResource,
        PIX_OUT_BATCH: "PIX_OUT_BATCH" as SubResource,
        DICT: "DICT" as SubResource,
        REFUND: "REFUND" as SubResource,
    } as const,
    FINANCIAL: {
        PIN: "PIN" as SubResource,
    } as const,
} as const;

export type ResourceKey = keyof typeof PermissionResource;
export type ResourcesWithSubs = keyof typeof PermissionSubResource;

export type FlatPermission =
    | "*"
    | `${ResourceKey}:${PermissionAction}`
    | `${ResourcesWithSubs}.${string}:${PermissionAction}`
    | `${ResourcesWithSubs}.${string}:*`
    | `${string}:*`;

export type PermissionTree = {
    [K in ResourceKey]?: PermissionAction[] | {
        [SR in Extract<ResourcesWithSubs, K>]?: Partial<Record<keyof typeof PermissionSubResource[SR], PermissionAction[]>>;
    };
} | "*"[];
