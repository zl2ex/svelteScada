<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";

  let { form } = $props();

  const redirect = page.url.searchParams.get("redirect");
</script>

<div id="login">
  <form
    use:enhance={() => {
      return async ({ update }) => {
        update({ reset: false });
      };
    }}
    method="POST"
    action="?/login&{redirect}"
    class="max-w-80 m-auto p-2 space-y-2"
  >
    <h3 class="h3">Login</h3>
    <div>
      <label for="email" class="label">Email</label>
      <input name="email" type="email" autocomplete="on" class="input" />
    </div>
    <div>
      <label for="password" class="label">Password</label>
      <input name="password" type="password" autocomplete="on" class="input" />
    </div>
    <div class="flex justify-between items-center">
      <button class="btn preset-filled" type="submit">Login</button>
      <a href="/register" class="anchor">register</a>
    </div>

    <div>
      {#if form?.sucsess == false}
        <p class="text-error-950-50">{form?.message}</p>
      {/if}
    </div>
  </form>
</div>
