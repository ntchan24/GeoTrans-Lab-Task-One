<script>
    // The 'data' prop contains everything returned from load() in +page.server.js
    export let data;
    $: ({ jsonData, logids, timestamp, times_of_day, bins, sensors, distances } = data.base_chart_data || {});
    $: ({ routeids } = data.map_plot_data || {});
    $: ({ mapMatch } = data.map_snap_data || {}); //from the map snap script
    $: ({ snapData } = data.snap_quality_data || {});

    import TodVisualization from '$lib/components/tod_visualization.svelte';
    import MostDataPiechart from '$lib/components/most_data_piechart.svelte';
    import MostTravelBoxplot from '$lib/components/most_travel_boxplot.svelte';
    import MostTravelBarChart from '$lib/components/most_travel_bar_chart.svelte';
    import MapPlot from '$lib/components/map_plot.svelte';
    import MapSnap from '$lib/components/map_snap.svelte';
    import SnapQualityPanel from '$lib/components/snap_quality_panel.svelte';

    import { TODchartType, piechartType, myOptions } from "./settings.js"

    // Dashboard state
    let activeTab = 'analytics';

    // Chart configurations
    let type = TODchartType
    let options = myOptions

    $: config = {
        type,
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
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

    let pietype = piechartType;

    $: config2 = {
        type: pietype,
        data: {
            labels: sensors?.[0] || [],
            datasets: [{
                label: "Entries Collected by Sensor",
                data: sensors?.[1] || [],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.5)',
                    'rgba(54, 162, 235, 0.5)',
                    'rgba(255, 206, 86, 0.5)',
                    'rgba(75, 192, 192, 0.5)'
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

    $: config3 = {
        type,
        data: {
            labels: distances[0],
            datasets: [{
                label: 'Distances travelled by sensors',
                data: distances[1] || [],
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
                    text: 'Distance Distribution'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Distance (kM)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Sensor'
                    }
                }
            }
        }
    }
</script>

<div class="dashboard-container flex flex-1 min-h-0 overflow-hidden">
    <aside class="w-56 bg-base-200 shadow-sm p-4 flex flex-col gap-4">
        <h1 class="text-xl font-bold px-2">GeoTrans Lab</h1>
        <ul class="menu menu-md bg-base-200 rounded-box w-full">
            <li><button
                    class:active={activeTab === 'analytics'}
                    on:click={() => activeTab = 'analytics'}
                >
                    Analytics
                </button></li>
            <li><button
                    class:active={activeTab === 'map-plot'}
                    on:click={() => activeTab = 'map-plot'}
                >
                    Map Plot
                </button></li>
            <li><button
                    class:active={activeTab === 'map-snap'}
                    on:click={() => activeTab = 'map-snap'}
                >
                    Map Snapping Plot
                </button></li>
            <li><button
                    class:active={activeTab === 'snap-quality'}
                    on:click={() => activeTab = 'snap-quality'}
                >
                    Snap Quality
                </button></li>
        </ul>
    </aside>

    <main
        class="dashboard-content flex-1"
        class:p-4={activeTab !== 'map-snap' && activeTab !== 'map-plot'}
        class:px-4={activeTab === 'map-snap' || activeTab === 'map-plot'}
        class:pb-4={activeTab === 'map-snap' || activeTab === 'map-plot'}
    >
        {#if activeTab === 'analytics'}
            <div class="grid grid-cols-2 grid-rows-2 gap-6 h-full">
                <section class="flex flex-col min-h-0">
                    <div class="flex-1 min-h-0">
                        <TodVisualization {config} />
                    </div>
                </section>
                <section class="flex flex-col min-h-0">
                    <div class="flex-1 min-h-0">
                        {#if sensors && Array.isArray(sensors) && config2}
                            <MostDataPiechart {config2} />
                        {/if}
                    </div>
                </section>
                <section class="flex flex-col min-h-0">
                    <div class="flex-1 min-h-0">
                        <MostTravelBoxplot sensorData={distances[2]} />
                    </div>
                </section>
                <section class="flex flex-col min-h-0">
                    <div class="flex-1 min-h-0">
                        <MostTravelBarChart {config3} />
                    </div>
                </section>
            </div>
        {:else if activeTab === 'map-plot'}
            <div class="chart-container">

                {#if routeids && Object.keys(routeids).length > 0}
                    <MapPlot {routeids} />
                    <!-- static street map display -->
                    <!-- <iframe width="500" height="300" allow="geolocation" src="https://api.maptiler.com/maps/streets-v4/?key=UHv14Wh0RtdXjkmopUTK#11.9/53.52029/-113.48545"></iframe> -->
                {/if}
            </div>

         {:else if activeTab === 'map-snap'}
            <div class="chart-container">

                {#if mapMatch && Object.keys(mapMatch).length > 0}
                    <MapSnap {mapMatch} />

                {/if}
            </div>

        {:else if activeTab === 'snap-quality'}
            <div class="h-full">
                {#if snapData && Object.keys(snapData).length > 0}
                    <SnapQualityPanel {snapData} />
                {/if}
            </div>

        {/if}
    </main>
</div>

