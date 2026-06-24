<script lang="ts">
  import { page } from "$app/state";
  import RemoteForm from "$lib/client/componets/remoteFormElements/RemoteForm/index.js";
  import { login } from "$lib/remote/user.remote";

  const redirect = page.url.searchParams.get("redirect");
</script>

<div id="login">
  <form {...login} class="max-w-80 m-auto p-2 space-y-2">
    <h3 class="h3">Login</h3>
    <RemoteForm feild={login.fields.email}>
      <RemoteForm.Label>Email</RemoteForm.Label>
      <RemoteForm.Input as="email" />
      <RemoteForm.Issue />
    </RemoteForm>

    <RemoteForm feild={login.fields.password}>
      <RemoteForm.Label>Password</RemoteForm.Label>
      <RemoteForm.Input as="password" />
      <RemoteForm.Issue />
    </RemoteForm>

    <div class="flex justify-between items-center">
      <button class="btn preset-filled" type="submit">Login</button>
      <a href="/register" class="anchor">register</a>
    </div>

    <div>
      {#each login.fields.allIssues() ?? [] as issue}
        <p class="text-error-300-700">{issue.message}</p>
      {/each}
    </div>
  </form>
</div>
