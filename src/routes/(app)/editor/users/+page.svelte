<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { userRoles, type UserRole } from "$lib/permissions/constants";
  import { createUser, deleteUser, setUserPermissions, updateUserRole } from "$lib/remote/user.remote";
  import { toast } from "$lib/client/toast.svelte";
  import { attempt } from "$lib/util/attempt";
  import { errorToString } from "$lib/util/neverThrow";
  import { commitOrRevert } from "$lib/client/util/use";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let role = $state<UserRole>("viewer");
  let saving = $state(false);
  let ruleDrafts = $state<Record<string, string>>({});

  /**
   * Serialize a user's permission rules for editing as JSON.
   *
   * @param permissions - the user's CASL permission records
   * @returns the formatted JSON string of the rules
   */
  function serializeRules(permissions: PageData["users"][number]["permissions"]) {
    return JSON.stringify(
      permissions.map((permission) => ({
        action: permission.action,
        subject: permission.subject,
        conditions: permission.conditions,
        fields: permission.fields,
        inverted: permission.inverted,
        reason: permission.reason,
      })),
      null,
      2,
    );
  }

  $effect(() => {
    for (const user of data.users) {
      if (!(user.id in ruleDrafts)) {
        ruleDrafts[user.id] = serializeRules(user.permissions);
      }
    }
  });

  /**
   * Run a user-admin action, refreshing data and reporting the outcome.
   *
   * @param action - the async remote action to execute
   * @param success - the toast title shown on success
   * @returns true on success, false when the action or refresh fails
   */
  async function run(action: () => Promise<unknown>, success: string) {
    saving = true;
    const result = await attempt(action);
    saving = false;
    if (result.isErr) {
      console.error(result.error);
      toast({ kind: "error", title: "User administration failed", description: errorToString(result.error) });
      return false;
    }
    await invalidateAll();
    toast({ kind: "success", title: success });
    return true;
  }

  /**
   * Handle the add-user form submit.
   *
   * @param event - the form submit event
   */
  async function addUser(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) return;
    const created = await run(
      () => createUser({ name: name.trim(), email: email.trim(), password, role }),
      "User created",
    );
    if (!created) return;
    name = "";
    email = "";
    password = "";
    role = "viewer";
  }

  /**
   * Change a user's role.
   *
   * @param userId - the id of the user to update
   * @param nextRole - the role to assign
   */
  async function changeRole(userId: string, nextRole: UserRole) {
    await run(() => updateUserRole({ userId, role: nextRole }), "Role updated");
  }

  /**
   * Confirm and delete a user.
   *
   * @param userId - the id of the user to delete
   * @param userName - the name shown in the confirmation prompt
   */
  async function removeUser(userId: string, userName: string) {
    if (!confirm(`Delete ${userName}?`)) return;
    await run(() => deleteUser({ userId }), "User deleted");
  }

  /**
   * Validate the permission JSON draft and save it for a user.
   *
   * @param userId - the id of the user whose rules are saved
   */
  async function saveRules(userId: string) {
    const draft = ruleDrafts[userId] ?? "[]";
    let rules: unknown;
    try {
      rules = JSON.parse(draft);
    } catch (error) {
      toast({ kind: "error", title: "Invalid permission JSON", description: errorToString(error) });
      return;
    }
    if (!Array.isArray(rules)) {
      toast({ kind: "error", title: "Invalid permission JSON", description: "Rules must be an array" });
      return;
    }
    await run(() => setUserPermissions({ userId, rules }), "Permission rules updated");
  }
</script>

<div class="p-4 flex flex-col gap-6 text-sm">
  <div>
    <h1 class="h3 mb-2">Users</h1>
    <p class="opacity-60">
      Roles define baseline access. Per-user rules are CASL overrides stored in `user_permissions`.
    </p>
  </div>

  <form class="card p-4 flex flex-wrap items-end gap-2" onsubmit={addUser}>
    <label class="flex flex-col gap-1">
      <span class="opacity-60">Name</span>
      <input
        class="input"
        bind:value={name}
        required
        {@attach commitOrRevert((value) => { name = value; }, "string", undefined, {
          allowNativeEnter: true,
        })}
      />
    </label>
    <label class="flex flex-col gap-1">
      <span class="opacity-60">Email</span>
      <input class="input" type="email" bind:value={email} required />
    </label>
    <label class="flex flex-col gap-1">
      <span class="opacity-60">Initial password</span>
      <input class="input" type="password" minlength="8" bind:value={password} required />
    </label>
    <label class="flex flex-col gap-1">
      <span class="opacity-60">Role</span>
      <select
        class="input"
        bind:value={role}
        {@attach commitOrRevert((value) => { role = value as UserRole; }, "string", undefined, {
          allowNativeEnter: true,
        })}
      >
        {#each userRoles as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
    <button class="btn preset-filled" type="submit" disabled={saving}>Add user</button>
  </form>

  <div class="flex flex-col gap-4">
    {#each data.users as user (user.id)}
      <section class="card p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="grow min-w-0">
            <p class="font-semibold truncate">{user.name}</p>
            <p class="opacity-60 truncate">{user.email}</p>
          </div>
          <select
            class="input w-40"
            value={user.role}
            {@attach commitOrRevert((value) => changeRole(user.id, value as UserRole))}
          >
            {#each userRoles as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
          <button class="btn btn-sm preset-tonal" onclick={() => removeUser(user.id, user.name)}>
            Delete
          </button>
        </div>

        <label class="flex flex-col gap-1">
          <span class="opacity-60">Permission overrides (CASL raw rules JSON)</span>
          <textarea
            class="input min-h-40 font-mono text-xs"
            value={ruleDrafts[user.id] ?? "[]"}
            oninput={(event) => (ruleDrafts[user.id] = event.currentTarget.value)}
          ></textarea>
        </label>
        <div class="flex justify-end">
          <button class="btn btn-sm preset-filled" onclick={() => saveRules(user.id)} disabled={saving}>
            Save rules
          </button>
        </div>
      </section>
    {/each}
  </div>
</div>
