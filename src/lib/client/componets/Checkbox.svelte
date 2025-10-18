<script lang="ts">
  let { name, checked = $bindable() } = $props<{
    name: string;
    checked: boolean;
  }>();
</script>

<label class="switch">
  <input type="checkbox" {name} bind:checked />
  <span class="slider"></span>
</label>

<style>
  label {
    --transition: 0.2s;
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
