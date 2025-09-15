<script lang="ts">
  import NumberDisplay from "$lib/client/componets/scada/NumberDisplay.svelte";

  import { enhance } from "$app/forms";
  //import { getTagState } from '$lib/tag/ui/tagState.svelte.js';

  let { data } = $props();
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

<NumberDisplay path="/demo/test" faultFlash></NumberDisplay>
<NumberDisplay path="/demo/test1" faultFlash></NumberDisplay>
<NumberDisplay path="/testTag" faultFlash></NumberDisplay>

<!--
<DigitalInRound tag={ts.tags.aprt01} onclick={onClick} style="width: 20px" faultFlash/>
<DigitalInRound tag={ts.tags.aprt02} onclick={onClick1} style="width: 20px" faultFlash/>



<TagViewer bind:tag={ts.tags.aprt01}></TagViewer>
<TagViewer bind:tag={ts.tags.aprt02}></TagViewer>
<TagViewer bind:tag={ts.tags.attx01}></TagViewer>
-->
<!--<NumberDisplay tag={tag.tagStoreDemo} style="" faultFlash></NumberDisplay>
-->
