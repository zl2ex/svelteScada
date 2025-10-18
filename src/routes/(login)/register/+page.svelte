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
  >
    <h2>Register</h2>
    <div class="form-item">
      <label for="email">Email</label>
      <input name="email" type="email" />
    </div>
    <div class="form-item">
      <label for="password">Password</label>
      <input name="password" type="password" />
    </div>
    <div class="form-item">
      <button class="primary" type="submit">Register</button>
    </div>

    <div class="form-item">
      {#if form?.sucsess == false}
        <p class="issue">{form?.message}</p>
      {/if}
    </div>
  </form>
</div>

<style>
  #register {
    display: flex;
    justify-content: center;
  }

  form {
    display: grid;
    gap: 1rem;
    width: clamp(250px, 30%, 300px);
  }
</style>
