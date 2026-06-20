<script lang="ts">
  import { enhance } from "$app/forms";

  let { form } = $props();
</script>

<div id="register">
  <form
    use:enhance={() => {
      return async ({ update }) => {
        update({ reset: false });
      };
    }}
    method="POST"
    action="?/register"
    class="max-w-80 m-auto p-2 space-y-2"
  >
    <h3 class="h3">Register</h3>
    <div>
      <label for="email" class="label">Email</label>
      <input name="email" type="email" class="input" />
    </div>
    <div>
      <label for="password" class="label">Password</label>
      <input name="password" type="password" class="input" />
    </div>
    <div>
      <button class="btn preset-filled" type="submit">Register</button>
    </div>

    <div class="form-item">
      {#if form?.sucsess == false}
        <p class="text-error-950-50">{form?.message}</p>
      {/if}
    </div>
  </form>
</div>
