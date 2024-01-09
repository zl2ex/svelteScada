<script lang="ts">
  
    import DigitalInRound from '$lib/componets/scada/DigitalInRound.svelte';
    import NumberDisplay from '$lib/componets/scada/NumberDisplay.svelte';
    import { tagStoreInit, tagsRef } from '$lib/tag/tagStoreSSE.svelte';

    import TagViewer from '$lib/componets/TagViewer.svelte';
    import { onMount } from 'svelte';


	let { data } = $props();

    let tags = data.tagsSSE;
/*
    onMount(() => {
        tagStoreInit(data.tagsSSE);
        tags = tagsRef();
    });
*/

    function subscribe() {
        console.log("subscribe");
		const sse = new EventSource('/sse');
		sse.onmessage = () => {console.log("client event")}
		return () => sse.close();
	}

	onMount(subscribe);

    
    

    console.log(tags);

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

<DigitalInRound tag={tags.aprt01} on:click={onClick} style="width: 20px" faultFlash/>
<DigitalInRound tag={tags.aprt02} on:click={onClick1} style="width: 20px" faultFlash/>
<NumberDisplay tag={tags.attx01} faultFlash></NumberDisplay>


<TagViewer bind:tag={tags.aprt01}></TagViewer>
<TagViewer bind:tag={tags.aprt02}></TagViewer>
<TagViewer bind:tag={tags.attx01}></TagViewer>

<!--<NumberDisplay tag={tag.tagStoreDemo} style="" faultFlash></NumberDisplay>
-->

