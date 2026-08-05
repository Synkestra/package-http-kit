import { z } from "zod";
import { PermissionResource, PermissionAction, PermissionSubResource } from "../permission/PermissionConfig";

const resources = Object.values(PermissionResource).join("|");
const actions = Object.values(PermissionAction).join("|");
const resourcesWithSubs = Object.keys(PermissionSubResource).join("|");
const subResources = Object.values(PermissionSubResource).flatMap(s => Object.keys(s)).join("|");

export const createFlatPermissionSchema = z.union([
    z.literal("*"),
    // RESOURCE:ACTION
    z.string().regex(new RegExp(`^(${resources}):(${actions})$`)),

    // RESOURCE.SUB:ACTION
    z.string().regex(new RegExp(`^(${resourcesWithSubs})\\.(${subResources}):(${actions})$`)),

    // RESOURCE.SUB:* ← NOVO
    z.string().regex(new RegExp(`^(${resourcesWithSubs})\\.(${subResources}):\\*$`)),

    // QUALQUER:*   ← NOVO
    z.string().regex(/^(.+):\*$/)
]);
