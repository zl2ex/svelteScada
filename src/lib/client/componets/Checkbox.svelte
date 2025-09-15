
<script lang="ts">
    let { name, checked } = $props<{name: string, checked: boolean}>();
</script>



<label class="switch">
    <input type="checkbox" name={name} bind:checked on:input>
    <span class="slider"></span>
</label>



<style>

    label {
        --transition: 0.4s;
    }

    /* The switch - the box around the slider */
    .switch {
        position: relative;
        display: flex;
        width: 2.5rem;   
    }

    /* Hide default HTML checkbox */
    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
        margin: 0;
        padding: 0;
    }

    /* The slider */
    .slider {
        /*position: absolute;*/
        cursor: pointer;
        border-radius: 0.75rem;
        background-color: var(--app-color-neutral-500);
        width: 2.5rem;
    }

    .slider:before {
        height: 1rem;
        width: 1rem;
        margin: 0.1rem;
        content: "";
        display: block;
        border-radius: 50%;
        background-color: var(--app-color-neutral-900);
        -webkit-transition: var(--transition);
        transition: var(--transition);
    }

    input:checked + .slider {
        background-color: var(--app-color-state-on);
        -webkit-transition: var(--transition);
        transition: var(--transition);
    }

    input:focus-visible + .slider {
        outline: 2px solid var(--app-color-primary-600);
    }

    input:checked + .slider:before {
        -webkit-transform: translateX(1.3rem);
        -ms-transform: translateX(1.3rem);
        transform: translateX(1.3rem);
    }

</style>

<!--
<div id="container">
    <span id="labelText">{label}</span>
    <input type="checkbox" name={name} id={name} class="toggle" bind:checked on:input>
    <label for={name}>
        <div></div>
    </label>
</div>



<style>

    #container {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 80%;
        padding: 0.5rem 0rem;
    }

    input[type="checkbox"].toggle {
        opacity: 0;
        position: absolute;
        left: -9000px;
    }

    input[type="checkbox"].toggle + label {
        position: relative;
        display: flex;
        align-items: center;
        cursor: pointer;
    }

    input[type="checkbox"].toggle + label::before {
        content: "";
        width: 2em;
        height: 1em;
        background-color: hsl(0, 80%, 90%);
        border-radius: 1em;
        margin-right: .25em;
        transition: background-color 200ms ease-in-out;
    }

    input[type="checkbox"].toggle + label::after {
        display: flex;
        justify-content: center;
        align-items: center;
        position: absolute;
        content: "\2715";
        font-size: .5em;
        height: .9em;
        left: .2em;
        width: 1.8em;
        height: 1.8em;
        background-color: hsl(0, 80%, 60%);
        color: white;
        border-radius: 1em;
        transition: background-color 200ms ease-in-out, transform 200ms ease-in-out;
    }

    /*
    input[type="checkbox"].toggle:focus-visible + label::before {
        outline: 1px solid black;
    }
*/
    input[type="checkbox"].toggle:checked + label::before {
        background-color: hsl(100, 70%, 90%);
    }

    input[type="checkbox"].toggle:checked + label::after {
        content: "\2713";
        transform: translateX(100%);
        background-color: hsl(100, 70%, 60%);
    }

    input[type="checkbox"].toggle:disabled + label {
        color: #777;
    }

    input[type="checkbox"].toggle:disabled + label::before {
        background-color: #CCC;
    }

    input[type="checkbox"].toggle:disabled + label::after {
        background-color: #777;
    }
</style>

-->