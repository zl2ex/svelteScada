export const userRoles = ["admin", "editor", "engineer", "operator", "viewer"] as const;

export type UserRole = (typeof userRoles)[number];

export const permissionActions = ["read", "create", "update", "delete", "manage", "write"] as const;

export type PermissionAction = (typeof permissionActions)[number];

export const permissionSubjects = [
  "all",
  "User",
  "Project",
  "Page",
  "Element",
  "UserComponent",
  "Device",
  "Tag",
  "UdtDefinition",
  "TagFolder",
  "TagValue",
  "Trend",
] as const;

export type PermissionSubject = (typeof permissionSubjects)[number];

export const tagWriteLevels = ["operator", "engineer", "admin"] as const;

export type TagWriteLevel = (typeof tagWriteLevels)[number];
