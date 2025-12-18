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
  >
    <h2>Login</h2>
    <div class="form-item">
      <label for="email">Email</label>
      <input name="email" type="email" autocomplete="on" />
    </div>
    <div class="form-item">
      <label for="password">Password</label>
      <input name="password" type="password" autocomplete="on" />
    </div>
    <div class="form-item-row">
      <button class="primary" type="submit">Login</button>
      <a href="/register">register</a>
    </div>

    <div class="form-item">
      {#if form?.sucsess == false}
        <p class="issue">{form?.message}</p>
      {/if}
    </div>
  </form>
</div>

<style>
  #login {
    display: flex;
    justify-content: center;
  }

  form {
    display: grid;
    gap: 1rem;
    width: clamp(250px, 30%, 300px);
  }
</style>
