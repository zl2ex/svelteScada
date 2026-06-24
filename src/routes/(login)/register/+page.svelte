<script lang="ts">
  import RemoteForm from "$lib/client/componets/remoteFormElements/RemoteForm";
  import { register } from "$lib/remote/user.remote.js";
</script>

<div id="register">
  <form class="max-w-80 m-auto p-2 space-y-2" {...register}>
    <h3 class="h3">Register</h3>

    <RemoteForm feild={register.fields.name}>
      <RemoteForm.Label>Name</RemoteForm.Label>
      <RemoteForm.Input as="text" />
      <RemoteForm.Issue />
    </RemoteForm>

    <RemoteForm feild={register.fields.email}>
      <RemoteForm.Label>Email</RemoteForm.Label>
      <RemoteForm.Input as="email" />
      <RemoteForm.Issue />
    </RemoteForm>

    <RemoteForm feild={register.fields.password}>
      <RemoteForm.Label>Password</RemoteForm.Label>
      <RemoteForm.Input as="password" />
      <RemoteForm.Issue />
    </RemoteForm>
    <div>
      <button class="btn preset-filled" type="submit">Register</button>
    </div>

    <div>
      {#each register.fields.allIssues() ?? [] as issue}
        <p class="text-error-300-700">{issue.message}</p>
      {/each}
    </div>
  </form>
</div>
