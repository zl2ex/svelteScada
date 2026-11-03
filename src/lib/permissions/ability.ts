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

export function defineAbilityFor(user: AbilityUser | null | undefined): AppAbility {
  if (!user) return createMongoAbility<[PermissionAction, PermissionSubject]>([]);

  const overrides = user.role === "admin" ? [] : user.permissions.map(toRawRule);

  return createMongoAbility<[PermissionAction, PermissionSubject]>([
    ...roleRules[user.role],
    ...overrides,
  ]);
}

export function tagValueSubject(writeLevel: TagWriteLevel) {
  return caslSubject("TagValue", { writeLevel });
}

export function canWriteTag(ability: AppAbility, writeLevel: TagWriteLevel) {
  return ability.can("write", tagValueSubject(writeLevel) as unknown as PermissionSubject);
}
