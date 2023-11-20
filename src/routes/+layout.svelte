<script lang="ts">
	import './styles.css';
	import github from '$lib/images/github.svg';
    import Hamburger from '$lib/componets/Hamburger.svelte';

	let menuOpen = false;

</script>

<div class="app">
	

	<header>
		<div class="corner">
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
			-->
			<Hamburger bind:active={menuOpen}/>
		</div>

		<div class="corner">
			<a href="https://github.com/sveltejs/kit">
				<img src={github} alt="GitHub" />
			</a>
		</div>
	</header>


	<section>
		<nav class={menuOpen ? "closed" : ""}>
			<a href="/">Home</a>
			<a href="/about">About</a>
			<a href="/login">Login</a>
			<a href="/register">Register</a>
			<a href="/scada">Scada</a>
		</nav>
		<main>
			<slot/>
		</main>
	</section>
	

	<footer>
		<p>visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to learn SvelteKit</p>
	</footer>
</div>

<style>

	header
	{
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: var(--app-color-neutral-400);

		& .corner
		{
			display: flex;
			align-items: center;

			& img
			{
				width: 2rem;
				height: 2rem;
				object-fit: contain;
			}

			& .Hamburger
			{
				display: flex;
			}

			/*
			& #hamburger
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

			& label
			{
				z-index: 20;
				display: none;

				&:focus:not(:active)
				{
					outline: 2px solid var(--app-color-primary-600);
				}

				& .hamburgerAnimation
				{
					width: 60px;
					padding: 10px;
					stroke: var(--app-color-neutral-900);

					& .top, .middle, .bottom
					{
						transition: 0.1s;
					}
				}
			}

			& #hamburger:checked
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
			*/
		}
	}


	section
	{
		display: flex;
		flex: 1;
		flex-direction: row;

		& main
		{
			flex: 1;
			flex-wrap: wrap;
			display: flex;
			flex-direction: row;
			align-items: start;
			justify-content: center;
		}

		& nav
		{
			display: flex;
			flex: 0;
			flex-direction: column;
			justify-content: start;
			background-color: brown;
			z-index: 10;

			& a
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
		}
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

		header .corner .Hamburger
		{
			display: flex;
		}

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
	}

</style>
