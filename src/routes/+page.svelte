<script>
    // The 'data' prop contains everything returned from load() in +page.server.js
    export let data;
    //bc of the file names, and "export" fxn, we can access exported data from server. 
    //we need to call the custom functions in the export function in server.
    //load() collects all the data i need from multiple functions if needed then passes it to page.svelte
    $: ({ jsonData, timestamp } = data);
</script>

<p>Nathan's Svelte Project</p>

<p>Loaded at: {timestamp}</p>
<p>{data}</p>

<!-- Display the JSON data -->
<pre>{JSON.stringify(jsonData, null, 2)}</pre>

<!-- Or access specific properties of your data -->
{#if jsonData}
    <p>Total entries: {Object.keys(jsonData).length}</p>
{/if}