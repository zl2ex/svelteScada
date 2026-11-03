import { getContext, setContext } from "svelte";
import type { AppAbility } from "$lib/permissions/ability";

const abilityKey = Symbol("app-ability");

export function setAbilityContext(ability: AppAbility) {
  setContext(abilityKey, ability);
}

export function getAbilityContext() {
  const ability = getContext<AppAbility | undefined>(abilityKey);
  if (!ability) {
    throw new Error("[abilityContext] getAbilityContext() called before setAbilityContext()");
  }
  return ability;
}
