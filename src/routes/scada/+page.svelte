<script lang="ts">
  
    import { onDestroy } from 'svelte';
    import { type Writable } from 'svelte/store';

    
    import DigitalInRound from '$lib/componets/scada/DigitalInRound.svelte';
    import type { Tags } from '$lib/tag/tags';
    import type { BaseTag } from '$lib/tag/baseTag';
    import NumberDisplay from '$lib/componets/scada/NumberDisplay.svelte';
    import { tags } from '$lib/tag/tagStore.svelte';

    import TagViewer from '$lib/componets/TagViewer.svelte';
    

    //export let data; // server load is cached'

    /*

    function createTagStore()
    {
        let tags = writable<BaseTag<object>>(undefined);
        function update()
        {
            console.log("update");

        }
        return {
            ...tags,
            update
        };
    }

*/
  

/*

    let tagsArray: Writable<BaseTag<object>> = {};
    for(let name of tagNames)
    {
        tagsArray[name] = createTagStore();
    };

    console.log(tagsArray.attx01.data.value);
    

    


        let tag = {
            tagStoreDemo: createTagStore<AnalogIn>(
            "tagStoreDemo", {
                value: 0,
                scaling: {
                    inMin: 0,
                    inMax: 1023,
                    outMin: 0,
                    outMax: 100
                }, fault: true
            }),
            tagStoreDem01: createTagStore<AnalogIn>(
            "tagStoreDemo1", {
                value: 1,
                scaling: {
                    inMin: 0,
                    inMax: 1023,
                    outMin: 0,
                    outMax: 100
                }, fault: false
            })
        };


        type Tag = typeof tag;

    

*/

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

<TagViewer tag={tags.aprt01}></TagViewer>
<TagViewer tag={tags.attx01}></TagViewer>
<!--<NumberDisplay tag={tag.tagStoreDemo} style="" faultFlash></NumberDisplay>
-->

