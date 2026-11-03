import { error } from "@sveltejs/kit";
import { LiveError } from "svelte-realtime/server";
import { defineAbilityFor, type AbilityUser, type AppAbility } from "$lib/permissions/ability";
import type { PermissionAction, PermissionSubject } from "$lib/permissions/constants";

export function can(
  ability: AppAbility,
  action: PermissionAction,
  subject: PermissionSubject | Record<string, unknown>,
) {
  return ability.can(action, subject as PermissionSubject);
}

export function assertCan(
  ability: AppAbility,
  action: PermissionAction,
  subject: PermissionSubject | Record<string, unknown>,
) {
  if (!can(ability, action, subject)) {
    throw error(403, `User is Forbidden to ${action} ${subject}`);
  }
}

export function assertLiveCan(
  user: AbilityUser | null | undefined,
  action: PermissionAction,
  subject: PermissionSubject | Record<string, unknown>,
) {
  const ability = defineAbilityFor(user);
  if (!can(ability, action, subject)) {
    throw new LiveError(
      "FORBIDDEN",
      `User ${user?.role} does not have permission to perform this ${action} on ${subject}`,
    );
  }
  return ability;
}

export function getAbility(user: AbilityUser | null | undefined) {
  return defineAbilityFor(user);
}
