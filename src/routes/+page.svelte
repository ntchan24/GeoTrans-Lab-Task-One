<script>
    // The 'data' prop contains everything returned from load() in +page.server.js
    export let data;
    $: ({ jsonData, logids, timestamp, times_of_day, bins, sensors, distances } = data.base_chart_data || {});
    $: ({ routeids } = data.map_plot_data || {});

    import TodVisualization from '$lib/components/tod_visualization.svelte';
    import MostDataPiechart from '$lib/components/most_data_piechart.svelte';
    import MostTravelBoxplot from '$lib/components/most_travel_boxplot.svelte';
    import MostTravelBarChart from '$lib/components/most_travel_bar_chart.svelte';
    import MapPlot from '$lib/components/map_plot.svelte';
    import { TODchartType, piechartType, myOptions } from "./settings.js"

    // Dashboard state
    let activeTab = 'time-of-day';

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

<div class="dashboard-container">
    <div class="navbar bg-base-100 shadow-sm">
  <div class="navbar-start">
    <div class="dropdown">
      <div tabindex="0" role="button" class="btn btn-ghost btn-circle">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /> </svg>
      </div>
      <ul
        tabindex="-1"
        class="menu menu-sm dropdown-content bg-base-100 rounded-box z-1 mt-3 w-52 p-2 shadow">
        <li><button

                class:active={activeTab === 'time-of-day'}
                on:click={() => activeTab = 'time-of-day'}
            >
                Time of Day
            </button></li>
        <li><button

                class:active={activeTab === 'sensor-data'}
                on:click={() => activeTab = 'sensor-data'}
            >
                Sensor Data
            </button></li>
        <li><button

                class:active={activeTab === 'distance'}
                on:click={() => activeTab = 'distance'}
            >
                Distance Analysis
            </button></li>
        <li><button

                class:active={activeTab === 'map-plot'}
                on:click={() => activeTab = 'map-plot'}
            >
                Map Plot
            </button></li>
      </ul>
    </div>
  </div>
  <div class="navbar-center">
  
    <h1>GeoTrans Lab</h1>
    
  </div>

</div>


    
    <main class="dashboard-content">
        {#if activeTab === 'time-of-day'}
            <div class="chart-container">

                <TodVisualization {config} />
            </div>
        {:else if activeTab === 'sensor-data'}
            <div class="chart-container">

                {#if sensors && Array.isArray(sensors) && config2}
                    <MostDataPiechart {config2} />
                {/if}
            </div>
        {:else if activeTab === 'distance'}
            <div class="chart-container">

                <div class="charts-grid">
                    <div class ="flex justify-center">

                        <MostTravelBoxplot sensorData={distances[2]}/>
                    </div>
                    <div>

                        <MostTravelBarChart {config3}/>
                    </div>
                </div>
            </div>
        {:else if activeTab === 'map-plot'}
            <div class="chart-container">

                {#if sensors && Array.isArray(sensors) && config2}
                    <MapPlot {routeids} />
                    <!-- static street map display -->
                    <!-- <iframe width="500" height="300" allow="geolocation" src="https://api.maptiler.com/maps/streets-v4/?key=UHv14Wh0RtdXjkmopUTK#11.9/53.52029/-113.48545"></iframe> -->
                {/if}
            </div>
        
        {/if}
    </main>
</div>

