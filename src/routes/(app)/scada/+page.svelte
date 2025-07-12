<script lang="ts">
    import DigitalInRound from '$lib/componets/scada/DigitalInRound.svelte';
    import NumberDisplay from '$lib/componets/scada/NumberDisplay.svelte';
    import TagViewer from '$lib/componets/scada/TagViewer.svelte';

    import { enhance } from '$app/forms';
    //import { getTagState } from '$lib/tag/ui/tagState.svelte.js';

    let { data } = $props();

    let number = $state(data.data);
/*
    let ts = getTagState();

    console.log(ts);
/*
    ts.subscribe("aprt01");
    ts.subscribe("aprt02");
    ts.subscribe("attx01");
    ts.subscribe("tagArray");
*/
      // WIP  ////////////////////////////////
      /*
    function onClick()
    {
        ts.tags.aprt01.data.fault = !ts.tags.aprt01.data.fault;
        console.log("click");
        //ts.tags.aprt01.write();
        ts._socketIo.emit("setTag:tags.aprt01", ts.tags.aprt01)
    }


    function onClick1()
    {
        ts.tags.aprt02.data.value = !ts.tags.aprt02.data.value;
        console.log("click1");
    }
*/
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
<!--
<DigitalInRound tag={ts.tags.aprt01} onclick={onClick} style="width: 20px" faultFlash/>
<DigitalInRound tag={ts.tags.aprt02} onclick={onClick1} style="width: 20px" faultFlash/>
<NumberDisplay tag={ts.tags.attx01} faultFlash></NumberDisplay>


<TagViewer bind:tag={ts.tags.aprt01}></TagViewer>
<TagViewer bind:tag={ts.tags.aprt02}></TagViewer>
<TagViewer bind:tag={ts.tags.attx01}></TagViewer>
-->
<!--<NumberDisplay tag={tag.tagStoreDemo} style="" faultFlash></NumberDisplay>
-->

