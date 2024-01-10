<script lang="ts">
    import type { BaseTag } from "$lib/tag/baseTag";

    type props = {
        tag: BaseTag<any>;
    }

	let { tag } = $props<props>();

    /* WIP Works for displaying but no binding
    function tableContent(obj:object):string
    {
        let output = "";
        for(const [key, value] of Object.entries(obj))
        {
            output += `<tr><td>${key}</td>`;

                if(typeof value === "boolean")
                {
                    output += `<td><input type="checkbox" bind:checked={tag.data[key]}/></td>`;
                }
                else if(typeof value === "number")
                {
                    output += `<td><input type="number" bind:value/></td>`;
                }
                else if(typeof value === "object")
                {
                    output += tableContent(value);
                }
                
            output += `</tr>`;
        }

        return output;
    }

    */


</script>


<div>
	<h3>{tag.name}</h3>
    <table>
        <thead>
            <tr>
                <td>key</td>
                <td>value</td>
            </tr>
        </thead>
        <tbody>

        <!--{@html tableContent}-->

        {#each Object.entries(tag.data) as [key, value], index(key)}
            <tr>
                <td>{key}</td>
                {#if typeof value === "boolean"}
                    <td><input type="checkbox" bind:checked={tag.data[key]}></td>
                {:else if typeof value === "number"}
                    <td><input type="number" bind:value={tag.data[key]}></td>
                {:else if typeof value === "string"}
                    <td><input type="text" bind:value={tag.data[key]}></td>
                {:else if typeof value === "object"}
                    {#each Object.entries(tag.data[key]) as [k], index(k)}
                        <td><input type="number" bind:value={tag.data[key][k]}></td>
                    {/each}
                {:else if typeof value === "object"}
                    <td>object</td>
                    <!--{#each Object.entries(tag.data) as [key, value], index(key) }
                        //WIP further nesting
                    {/each}-->
                {/if}
                
            </tr>
        {/each}
        </tbody>
    </table>
</div>


<style>
	div 
	{
		display: flex;
		flex-direction: column;
		flex: 0;
		width: fit-content;
		border: 3px solid brown;
		padding: 1rem;
    }

    h3, h4, h5
    {
        margin: 0;
    }

    input[type="number"]
    {
        width: 6rem;
    }
    
	
</style>