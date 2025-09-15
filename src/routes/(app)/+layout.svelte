<script lang="ts">
  import "../styles.css";
  import Hamburger from "$lib/client/componets/Hamburger.svelte";

  const { children, data } = $props();

  let menuOpen = $state(false);

  //setTagState();
  /*
	let socket: Socket | undefined;
	onMount(() => {
		socket = io();
		socket.on("tag:update", ( {nodeId, value }) => {
		//tags.update(t => ({ ...t, [tag.name]: tag.value });
			console.log("tag:update " + nodeId + " = " + value);
		});
		socket.on("connect", () => {
			console.log("socketIO Connected");
			//subscribe(["ns=1;s=Local.Status"]);
			writeTag("ns=1;s=Local.Status", 25.4)
		});
	});

	function writeTag(nodeId: string, value: any) {
		socket.emit("tag:write", { nodeId, value });
	}

	function subscribe(nodeIds: string[]) {
		socket.emit("tag:subscribe", nodeIds);
	}
*/

  //socketIoTagsClient(data.tags);

  function globalClickHandler(event: Event) {
    //close the menu if a user clicks a link in navigation
    if (event.target && event.target.tagName === "A") {
      menuOpen = false;
    }
  }
</script>

`<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="app" onclick={globalClickHandler}>
  <header>
    <div class="corner">
      <Hamburger bind:active={menuOpen} />
    </div>
    <h2>Title</h2>
    <div class="corner">
      {#if data.user}
        <span>{data.user.email}</span>
        <form id="logout" action="/api/logout?/logout" method="POST">
          <button type="submit" class="secondary">logout</button>
        </form>
      {/if}
    </div>
  </header>

  <section>
    <nav class={menuOpen ? "" : "closed"}>
      <a href="/">Home</a>
      <a href="/scada">Scada</a>
      <a href="/scada/tags">Tags</a>
    </nav>
    <main>
      {@render children()}
    </main>
  </section>
</div>
`

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--app-color-neutral-300);
  }

  header h2 {
    margin: 0;
  }

  header .corner {
    display: flex;
    align-items: center;
    flex-direction: column;
  }

  header .corner img {
    width: 2rem;
    height: 2rem;
    object-fit: contain;
  }

  .corner .Hamburger {
    display: none;
  }

  section {
    display: flex;
    flex: 1;
    flex-direction: row;
  }

  main {
    /*flex: 1;
		flex-wrap: wrap;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: start;*/
    width: 100%;
    min-height: 100%;
  }

  nav {
    display: flex;
    flex: 0;
    flex-direction: column;
    justify-content: start;
    background-color: brown;
    z-index: 10;
  }

  nav a {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.5rem;
    color: inherit;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1rem;
    text-decoration: none;
  }

  footer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  /*on mobile show hamburger and have a closable side menu*/
  @media only screen and (max-aspect-ratio: 0.7) {
    section nav {
      position: absolute;
      padding-top: 4rem;
      top: 0;
      left: 0;
      bottom: 0;
      box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.2);
    }

    section nav.closed {
      display: none;
    }

    .corner .Hamburger {
      display: block;
    }
  }
</style>
