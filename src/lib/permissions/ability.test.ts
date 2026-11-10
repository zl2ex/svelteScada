import { describe, expect, it } from "vitest";
import { canWriteTag, defineAbilityFor, type AbilityPermission } from "./ability";
import type { UserRole } from "./constants";

function user(role: UserRole, permissions: AbilityPermission[] = []) {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    role,
    permissions,
  };
}

describe("CASL role abilities", () => {
  it("allows admin to manage every subject", () => {
    const ability = defineAbilityFor(user("admin"));

    expect(ability.can("manage", "User")).toBe(true);
    expect(ability.can("update", "Device")).toBe(true);
    expect(canWriteTag(ability, "admin")).toBe(true);
  });

  it("lets editor manage configuration but not users", () => {
    const ability = defineAbilityFor(user("editor"));

    expect(ability.can("update", "Page")).toBe(true);
    expect(ability.can("update", "Device")).toBe(true);
    expect(ability.can("update", "Tag")).toBe(true);
    expect(ability.can("manage", "UdtDefinition")).toBe(true);
    expect(ability.can("manage", "User")).toBe(false);
  });

  it("lets engineer write operator and engineer tags only", () => {
    const ability = defineAbilityFor(user("engineer"));

    expect(canWriteTag(ability, "operator")).toBe(true);
    expect(canWriteTag(ability, "engineer")).toBe(true);
    expect(canWriteTag(ability, "admin")).toBe(false);
    expect(ability.can("update", "Device")).toBe(false);
    expect(ability.can("manage", "UdtDefinition")).toBe(false);
  });

  it("lets operator write operator tags only", () => {
    const ability = defineAbilityFor(user("operator"));

    expect(canWriteTag(ability, "operator")).toBe(true);
    expect(canWriteTag(ability, "engineer")).toBe(false);
    expect(canWriteTag(ability, "admin")).toBe(false);
  });

  it("makes viewer read-only", () => {
    const ability = defineAbilityFor(user("viewer"));

    expect(ability.can("read", "Project")).toBe(true);
    expect(ability.can("update", "Project")).toBe(false);
    expect(canWriteTag(ability, "operator")).toBe(false);
  });

  it("applies per-user grants and inverted rules", () => {
    const granted = defineAbilityFor(
      user("operator", [
        { action: "write", subject: "TagValue", conditions: { writeLevel: "engineer" } },
      ]),
    );
    expect(canWriteTag(granted, "engineer")).toBe(true);

    const denied = defineAbilityFor(
      user("viewer", [{ action: "read", subject: "Project", inverted: true }]),
    );
    expect(denied.can("read", "Project")).toBe(false);
  });

  it("does not let overrides restrict an admin", () => {
    const ability = defineAbilityFor(
      user("admin", [{ action: "manage", subject: "all", inverted: true }]),
    );

    expect(ability.can("manage", "User")).toBe(true);
    expect(ability.can("manage", "UdtDefinition")).toBe(true);
  });
});
