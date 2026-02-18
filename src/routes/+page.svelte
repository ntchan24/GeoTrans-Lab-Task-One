<script>

    // The 'data' prop contains everything returned from load() in +page.server.js
    export let data;
    //bc of the file names, and "export" fxn, we can access exported data from server. 
    //we need to call the custom functions in the export function in server.
    //load() collects all the data i need from multiple functions if needed then passes it to page.svelte
    $: ({ jsonData, logids, timestamp, times_of_day,bins } = data);

    import TodVisualization from '$lib/components/tod_visualization.svelte';

    import  {chartType,myOptions} from "./settings.js"
    
    
    let type = chartType

	let options = myOptions

	// Debug: log bins when they change (can be removed once working)
	// $: if (bins) console.log('Bins data:', bins);

	$: config = {
		type,
		data: {
			labels: Array.from({length: 24}, (_, i) => `${i}:00`), // Hours 0-23
			datasets: [{
				label: 'Events per Hour',
				data: bins || [],
				backgroundColor: 'rgba(54, 162, 235, 0.5)',
				borderColor: 'rgba(54, 162, 235, 1)',
				borderWidth: 1
			}]
		},
		options: options || {
			responsive: true,
			plugins: {
				legend: {
					display: true,
					position: 'top'
				},
				title: {
					display: true,
					text: 'Time of Day Distribution'
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					title: {
						display: true,
						text: 'Count'
					}
				},
				x: {
					title: {
						display: true,
						text: 'Hour of Day'
					}
				}
			}
		}
	}
</script>



	<h1>Time of Day Distribution</h1>
	<TodVisualization {config} />

	<p>Nathan's Svelte Project</p>
	<p>raw bins: {bins}</p>
	<p>logids: {logids}</p>
	<p>raw_times_of_day: {times_of_day}</p>
	<p>Loaded at: {timestamp}</p>






<!-- Display the JSON data -->
<pre>{JSON.stringify(jsonData, null, 2)}</pre>

<!-- Or access specific properties of your data -->
{#if jsonData}
    <p>Total entries: {Object.keys(jsonData).length}</p>
{/if}
