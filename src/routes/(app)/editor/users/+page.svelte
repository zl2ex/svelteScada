<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { userRoles, type UserRole } from "$lib/permissions/constants";
  import { createUser, deleteUser, setUserPermissions, updateUserRole } from "$lib/remote/user.remote";
  import { toast } from "$lib/client/toast.svelte";
  import { attempt } from "$lib/util/attempt";
  import { errorToString } from "$lib/util/neverThrow";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let role = $state<UserRole>("viewer");
  let saving = $state(false);
  let ruleDrafts = $state<Record<string, string>>({});

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

  async function changeRole(userId: string, nextRole: UserRole) {
    await run(() => updateUserRole({ userId, role: nextRole }), "Role updated");
  }

  async function removeUser(userId: string, userName: string) {
    if (!confirm(`Delete ${userName}?`)) return;
    await run(() => deleteUser({ userId }), "User deleted");
  }

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
      <input class="input" bind:value={name} required />
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
      <select class="input" bind:value={role}>
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
            onchange={(event) => changeRole(user.id, event.currentTarget.value as UserRole)}
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
