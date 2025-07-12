<script lang="ts">
    let { data } = $props();

    let opcuaNodes = $state(data.opcuaNodes);

    function browse(nodeId: string) {
        fetch(`?browse=${nodeId}`, { method: "GET" })
        .then(async (res) => {
            opcuaNodes = await res.json();
        });
    }

</script>


<div>
    {#each opcuaNodes as opcNode}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div onclick={() => {browse(opcNode.nodeId.toString())}}>
            {opcNode.browseName} {opcNode.nodeId} {opcNode.nodeClass} {opcNode.value}
        </div>
        <hr>
    {/each}
</div>


<style>

</style>