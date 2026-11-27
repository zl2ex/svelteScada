import { error } from "@sveltejs/kit";
import { LiveError } from "svelte-realtime/server";
import { defineAbilityFor, type AbilityUser, type AppAbility } from "$lib/permissions/ability";
import type { PermissionAction, PermissionSubject } from "$lib/permissions/constants";

/**
 * Checks whether an ability permits an action on a subject.
 *
 * @param ability - the ability describing the user's permissions
 * @param action - the action to authorize
 * @param subject - the subject type or object being acted upon
 * @returns true when the action is permitted
 */
export function can(
  ability: AppAbility,
  action: PermissionAction,
  subject: PermissionSubject | Record<string, unknown>,
) {
  return ability.can(action, subject as PermissionSubject);
}

/**
 * Throws a 403 when the ability does not permit the action on the subject.
 *
 * @param ability - the ability describing the user's permissions
 * @param action - the action to authorize
 * @param subject - the subject type or object being acted upon
 * @throws {HttpError} when the action is not permitted
 */
export function assertCan(
  ability: AppAbility,
  action: PermissionAction,
  subject: PermissionSubject | Record<string, unknown>,
) {
  if (!can(ability, action, subject)) {
    throw error(403, `User is Forbidden to ${action} ${subject}`);
  }
}

/**
 * Throws a live FORBIDDEN error when the user cannot perform the action.
 *
 * @param user - the user whose ability to build, or null/undefined for anonymous
 * @param action - the action to authorize
 * @param subject - the subject type or object being acted upon
 * @returns the user's ability when the action is permitted
 * @throws {LiveError} when the action is not permitted
 */
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

/**
 * Builds the permission ability for a user.
 *
 * @param user - the user whose ability to build, or null/undefined for anonymous
 * @returns the ability describing the user's permissions
 */
export function getAbility(user: AbilityUser | null | undefined) {
  return defineAbilityFor(user);
}
