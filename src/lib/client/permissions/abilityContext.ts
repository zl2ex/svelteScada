import { getContext, setContext } from "svelte";
import type { AppAbility } from "$lib/permissions/ability";

const abilityKey = Symbol("app-ability");

/**
 * Stores the app ability in the current Svelte context.
 *
 * @param ability - ability instance to make available to descendants
 */
export function setAbilityContext(ability: AppAbility) {
  setContext(abilityKey, ability);
}

/**
 * Reads the app ability from the current Svelte context.
 *
 * @returns the ability set by `setAbilityContext`
 * @throws {Error} when called before `setAbilityContext`
 */
export function getAbilityContext() {
  const ability = getContext<AppAbility | undefined>(abilityKey);
  if (!ability) {
    throw new Error("[abilityContext] getAbilityContext() called before setAbilityContext()");
  }
  return ability;
}
