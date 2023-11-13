<!--

<script lang="ts">
	import { page } from '$app/stores';
	import github from '$lib/images/github.svg';
    import Hamburger from '$lib/componets/Hamburger.svelte';
    import { onMount } from 'svelte';

	export let position: string = "top"; // position of navigation (top or left)
	export let closed: boolean = false; // is navigation closed (only applies to mobile)
	let mobile: boolean; // user is on mobile and therefore show mobile menu
	let devicePixelRatio: number;

	onMount(isMobileDevice);

	function isMobileDevice()
	{
		console.log(devicePixelRatio);
		if(devicePixelRatio > 1)
		{
			mobile = false;
			closed = false;
		}
		else 
		{
			mobile = true;
			closed = true;
		}
	}

	//$: isMobileDevice();

</script>

<svelte:window bind:devicePixelRatio/>

-->

<script lang="ts">
	import Hamburger from '$lib/componets/Hamburger.svelte';
	
</script>


<header>
	<div class="corner">
		<Hamburger/>
	</div>

	<div class="corner">
		<a href="https://github.com/sveltejs/kit">
			<img src={github} alt="GitHub" />
		</a>
	</div>
</header>

<style>
	header
	{
		display: flex;
		justify-content: space-between;
		align-items: center;

		& .corner
		{
			display: flex;
			align-items: center;

			& img
			{
				width: 2em;
				height: 2em;
				object-fit: contain;
			}
		}
	}

	

</style>
