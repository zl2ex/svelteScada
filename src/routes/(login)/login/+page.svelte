<script lang="ts">
    
    import { enhance } from '$app/forms';
    import { SvelteURL } from 'svelte/reactivity';

    let { form } = $props();

    //WIP Not working  
    const redirect = new SvelteURL("http://localhost:5173/login").search; //searchParams.get('redirect');

    
    console.log("redirect", redirect);

</script>

<div id="login">
    <form use:enhance={() => {
            return async ({ update }) => {
                update({ reset: false });
            };
        }}
        method="POST"
        action="?/login&{redirect}">

        <h2>Login</h2>
        <div class="form-item">
            <label for="email">Email</label>
            <input name="email" type="email"/>
        </div>
        <div class="form-item">
            <label for="password">Password</label>
            <input name="password" type="password"/>
        </div>
        <div class="form-item">
            <button class="primary" type="submit">Login</button>
        </div>

        <div class="form-item">
            {#if form?.sucsess == false}
                <p>{form?.message}</p>
            {/if}
        </div>
    </form>
</div>

<style>

    #login
    {
        display: flex;
        justify-content: center;
    }

    form
    {
        display: flex;
        flex-direction: column;
        width: clamp(250px, 30%, 300px);
        gap: 1rem;
    }
    
    input
    {
        border-radius: 0.2rem;
    }

    .form-item
    {
        display: flex;
        flex-direction: column;
    }

    .form-action
    {
        display: flex;
        justify-content: space-between;
    }

</style>