<script>

    // The 'data' prop contains everything returned from load() in +page.server.js
    export let data;
    //bc of the file names, and "export" fxn, we can access exported data from server. 
    //we need to call the custom functions in the export function in server.
    //load() collects all the data i need from multiple functions if needed then passes it to page.svelte
    $: ({ jsonData, logids, timestamp, times_of_day,bins,sensors } = data);

    import TodVisualization from '$lib/components/tod_visualization.svelte';
    import MostDataPiechart from '$lib/components/most_data_piechart.svelte';
    import MostTravelBoxplot from '$lib/components/most_travel_boxplot.svelte';
    import  {TODchartType,piechartType,myOptions} from "./settings.js"
    
    //for TOD chart 
    let type = TODchartType

	let options = myOptions

	$: config = {
		type,
		data: {
			labels: Array.from({length: 24}, (_, i) => `${i}:00`), // Hours 0-23
			datasets: [{
				label: 'Logs per Hour',
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
						text: 'Number of Logs'
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


    //for pie chart 
    let pietype = piechartType;

    $: config2 = {
        type: pietype,
        data: {
            labels: sensors?.[0] || [],
            datasets: [{
                label: "Entries Collected by Sensor",
                data: sensors?.[1] || [],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.5)',   // Red for _SE
                    'rgba(54, 162, 235, 0.5)',   // Blue for _NW
                    'rgba(255, 206, 86, 0.5)',   // Yellow for _CENTRAL
                    'rgba(75, 192, 192, 0.5)'    // Green for _RWIS
                ],
				borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)'
                ],
				borderWidth: 1
            }]
        },

        options: options || {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    position: "top"
                },
                title: {
                    display: true,
                    text: "Most entries collected by a sensor"
                }
            }
        }
    }

</script>



	<h1>Time of Day Distribution</h1>
	<TodVisualization {config} />
    <h1> Most Data Collected by a Sensor</h1>
    {#if sensors && Array.isArray(sensors) && config2}
        <MostDataPiechart {config2} />
    {/if} 

	<p>Nathan's Svelte Project</p>
	<p>raw bins: {bins}</p>
	<p>logids: {logids}</p>
	<p>raw_times_of_day: {times_of_day}</p>
	<p>Loaded at: {timestamp}</p>
	<p>sensors data: {JSON.stringify(sensors)}</p>






<!-- Display the JSON data -->
<pre>{JSON.stringify(jsonData, null, 2)}</pre>

<!-- Or access specific properties of your data -->
{#if jsonData}
    <p>Total entries: {Object.keys(jsonData).length}</p>
{/if}
