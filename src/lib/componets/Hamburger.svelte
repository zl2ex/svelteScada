
<script lang="ts">
    type props = {
        active: boolean;
    }

	let { active } = $props<props>();

    function toggleActive()
    {
        active = !active;
    }

</script>

<div class="Hamburger">
    <button on:click={toggleActive} class="hamburger" aria-label="Open Menu">
        <svg viewBox="0 0 60 40" class={active ? ' hamburgerAnimation active' : 'hamburgerAnimation'} >
            <g stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                <line class="top" x1="15%" y1="15%" x2="85%" y2="15%"></line>
                <line class="middle" x1="15%" y1="50%" x2="85%" y2="50%"></line>
                <line class="bottom" x1="15%" y1="85%" x2="85%" y2="85%"></line>
            </g>
        </svg>
    </button>
</div>

<style>
    button
    {
        background: inherit;
        border: none;
        outline: none;
        padding: 0;
        position: relative;
        z-index: 20;
    }

    button:focus
    {
        outline: none;
    }

    .hamburgerAnimation
    {
        width: 3rem;
        padding: 10px;
        stroke: var(--app-color-neutral-900);

    }

    
    .top, .middle, .bottom
    {
        transition: 0.1s;
    }
        
    
    .active .top
    {
        transform-origin: top left;
        transform: translate(25%, -5%) rotate(45deg) scaleX(0.85);
    }

    .active .middle
    {
        opacity: 0;
    }

    .active .bottom
    {
        transform-origin: bottom left;
        transform: translate(25%, 5%) rotate(-45deg) scaleX(0.85);
    }

</style>

<!--
<input type="checkbox" id="hamburger"/>
<label for="hamburger">
    <svg viewBox="0 0 60 40" class="hamburgerAnimation">
        <g stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <line class="top" x1="15%" y1="15%" x2="85%" y2="15%"></line>
            <line class="middle" x1="15%" y1="50%" x2="85%" y2="50%"></line>
            <line class="bottom" x1="15%" y1="85%" x2="85%" y2="85%"></line>
        </g>
    </svg>
</label>


<style>
    input
    {
        position: absolute;
        top: -1000px;
        left: -1000px;
        width: 0;
        height: 0;

        &:focus:not(:active)
        {
            outline: none;
        }
    }

    label
    {
        z-index: 10;

        &:focus:not(:active)
        {
            outline: 2px solid var(--app-color-primary-600);
        }
    }

    .hamburgerAnimation
    {
        width: 60px;
        padding: 10px;
        stroke: var(--app-color-neutral-900);

        & .top, .middle, .bottom
        {
            transition: 0.1s;
        }
    }

    #hamburger:checked
    {
        & ~ label .hamburgerAnimation .top
        {
            transform-origin: top left;
            transform: translate(25%, -5%) rotate(45deg) scaleX(0.85);
        }

        & ~ label .hamburgerAnimation .middle
        {
            opacity: 0;
        }

        & ~ label .hamburgerAnimation .bottom
        {
            transform-origin: bottom left;
            transform: translate(25%, 5%) rotate(-45deg) scaleX(0.85);
        }
    }
</style>
-->