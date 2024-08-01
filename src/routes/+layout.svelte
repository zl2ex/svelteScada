<script lang="ts">
	import './styles.css';
	import Hamburger from '$lib/componets/Hamburger.svelte';
	import { enhance } from '$app/forms';

	const { data } = $props();

	let menuOpen = $state(false);
	
	function handleAllAnchorClicks(event: Event) 
	{
		//close the menu if a user clicks a link in navigation
		if (event.target && event.target.tagName === 'A') 
		{
			menuOpen = false;
		}
	}
</script>

<div class="app">
	
	<header>
		<div class="corner">
			<Hamburger bind:active={menuOpen}/>
		</div>
		<h2>27b Willis</h2>
		<div class="corner">
			{#if data.user}
				<span>{data.user.email}</span>
				<form id="logout"
					action="?/logout"
					method="POST"
					use:enhance>
					<button type="submit">logout</button>
				</form>
			{/if}
		</div>
	</header>


	<section>
		<nav on:click={handleAllAnchorClicks} class={menuOpen ? "" : "closed"}>
			<a href="/">Home</a>
		</nav>
		<main>
			<slot/>
		</main>
	</section>
</div>

<style>

	header
	{
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: var(--app-color-neutral-300);
	}

	header h2 
	{
		margin: 0;
	}
	
	header .corner
	{
		display: flex;
		align-items: center;
		flex-direction: column;
	}

	header .corner img
	{
		width: 2rem;
		height: 2rem;
		object-fit: contain;
	}

	.corner .Hamburger
	{
		display: none;
	}


	section
	{
		display: flex;
		flex: 1;
		flex-direction: row;
	}

	main
	{
		/*flex: 1;
		flex-wrap: wrap;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: start;*/
		width: 100%;
		min-height: 100%;
	}

	nav
	{
		display: flex;
		flex: 0;
		flex-direction: column;
		justify-content: start;
		background-color: brown;
		z-index: 10;
	}

	nav a
	{
		display: flex;
		align-items: center;
		padding: 0.5rem 0.5rem;
		color: inherit;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.1rem;
		text-decoration: none;
	}

	footer
	{
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
	}


	/*on mobile show hamburger and have a closable side menu*/
	@media only screen and (max-aspect-ratio: 0.7)
	{
		section nav 
		{
			position: absolute;
			padding-top: 4rem;
			top: 0;
			left: 0;
			bottom: 0;
			box-shadow: 0 2px 4px 0 rgba(0,0,0,.2);
		}

		section nav.closed 
		{
			display: none;
		}

		.corner .Hamburger 
		{
			display: block;
		}
	}

</style>
