import {
  createMongoAbility,
  subject as caslSubject,
  type MongoAbility,
  type RawRuleOf,
} from "@casl/ability";
import type { PermissionAction, PermissionSubject, TagWriteLevel, UserRole } from "./constants";

export type AppAbility = MongoAbility<[PermissionAction, PermissionSubject]>;
export type AppRawRule = RawRuleOf<AppAbility>;

export type AbilityPermission = {
  action: PermissionAction;
  subject: PermissionSubject;
  conditions?: Record<string, unknown> | null;
  fields?: string[] | null;
  inverted?: boolean | null;
  reason?: string | null;
};

export type AbilityUser = {
  id: string;
  role: UserRole;
  permissions: AbilityPermission[];
};

export type SessionUser = AbilityUser & {
  name: string;
  email: string;
  tokenExpiresAt?: number;
};

const roleRules: Record<UserRole, AppRawRule[]> = {
  admin: [{ action: "manage", subject: "all" }],
  editor: [
    { action: "read", subject: "all" },
    {
      action: "manage",
      subject: [
        "Project",
        "Page",
        "Element",
        "UserComponent",
        "Device",
        "Tag",
        "UdtDefinition",
        "TagFolder",
        "TagValue",
      ],
    },
  ],
  engineer: [
    { action: "read", subject: "all" },
    {
      action: "write",
      subject: "TagValue",
      conditions: { writeLevel: { $in: ["operator", "engineer"] } },
    },
  ],
  operator: [
    { action: "read", subject: "all" },
    { action: "write", subject: "TagValue", conditions: { writeLevel: "operator" } },
  ],
  viewer: [{ action: "read", subject: "all" }],
};

/**
 * Converts a database permission record into a CASL raw rule.
 *
 * @param permission - The stored permission definition
 * @returns A CASL raw rule with undefined options omitted
 */
function toRawRule(permission: AbilityPermission): AppRawRule {
  return {
    action: permission.action,
    subject: permission.subject,
    conditions: (permission.conditions ?? undefined) as AppRawRule["conditions"],
    fields: permission.fields ?? undefined,
    inverted: permission.inverted ?? false,
    reason: permission.reason ?? undefined,
  };
}

/**
 * Builds a CASL ability from a user's role and explicit permissions.
 *
 * Admin users receive only role rules; other roles receive role rules plus overrides.
 *
 * @param user - The user to build an ability for, or null/undefined for an empty ability
 * @returns A MongoAbility honoring the user's role and permissions
 */
export function defineAbilityFor(user: AbilityUser | null | undefined): AppAbility {
  if (!user) return createMongoAbility<[PermissionAction, PermissionSubject]>([]);

  const overrides = user.role === "admin" ? [] : user.permissions.map(toRawRule);

  return createMongoAbility<[PermissionAction, PermissionSubject]>([
    ...roleRules[user.role],
    ...overrides,
  ]);
}

/**
 * Creates a CASL subject for a tag value at the given write level.
 *
 * @param writeLevel - The minimum write level required for the tag
 * @returns A TagValue subject carrying the write level condition
 */
export function tagValueSubject(writeLevel: TagWriteLevel) {
  return caslSubject("TagValue", { writeLevel });
}

/**
 * Checks whether an ability may write a tag value at the given write level.
 *
 * @param ability - The ability to test
 * @param writeLevel - The minimum write level required for the tag
 * @returns True when the ability grants a write to the TagValue subject
 */
export function canWriteTag(ability: AppAbility, writeLevel: TagWriteLevel) {
  return ability.can("write", tagValueSubject(writeLevel) as unknown as PermissionSubject);
}
