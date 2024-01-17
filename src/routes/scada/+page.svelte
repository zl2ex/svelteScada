<script lang="ts">
    import DigitalInRound from '$lib/componets/scada/DigitalInRound.svelte';
    import NumberDisplay from '$lib/componets/scada/NumberDisplay.svelte';
    import { getTagsContext } from '$lib/tag/tagStore.svelte';

    import TagViewer from '$lib/componets/TagViewer.svelte';

    import { enhance } from '$app/forms';

    let { data } = $props();

    let number = $state(data.data);

    let tags = getTagsContext();

      // WIP  ////////////////////////////////
    function onClick()
    {
        tags.aprt01.data.fault = !tags.aprt01.data.fault;
        console.log("click");
    }


    function onClick1()
    {
        tags.aprt02.data.value = !tags.aprt02.data.value;
        console.log("click1");
    }

///////////////////////////////////////

</script>

<form method="POST" action="?/update" use:enhance={() => {
    return async ({ update }) => {
        update({ reset: false });
    };
}}>
<input type="number" name="number" bind:value={number}/>

<button>submit</button>
</form>


<div>data.data = {number}</div>

<DigitalInRound tag={tags.aprt01} on:click={onClick} style="width: 20px" faultFlash/>
<DigitalInRound tag={tags.aprt02} on:click={onClick1} style="width: 20px" faultFlash/>
<NumberDisplay tag={tags.attx01} faultFlash></NumberDisplay>


<TagViewer bind:tag={tags.aprt01}></TagViewer>
<TagViewer bind:tag={tags.aprt02}></TagViewer>
<TagViewer bind:tag={tags.attx01}></TagViewer>
<TagViewer bind:tag={tags.tagArray}></TagViewer>
<TagViewer bind:tag={tags.tagArray}></TagViewer>

<!--<NumberDisplay tag={tag.tagStoreDemo} style="" faultFlash></NumberDisplay>
-->

