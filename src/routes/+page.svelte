<script>
    // The 'data' prop contains everything returned from load() in +page.server.js
    export let data;
    $: ({ jsonData, logids, timestamp, times_of_day, bins, sensors, distances } = data);

    import TodVisualization from '$lib/components/tod_visualization.svelte';
    import MostDataPiechart from '$lib/components/most_data_piechart.svelte';
    import MostTravelBoxplot from '$lib/components/most_travel_boxplot.svelte';
    import MostTravelBarChart from '$lib/components/most_travel_bar_chart.svelte';
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
    <!-- Header -->
    <header class="dashboard-header">
        <h1>GeoTransLab Dashboard</h1>
        <p class="timestamp">Last updated: {timestamp}</p>
    </header>

    <!-- Navigation Tabs -->
    <nav class="tab-navigation">
        <button
            class="tab-button"
            class:active={activeTab === 'time-of-day'}
            on:click={() => activeTab = 'time-of-day'}
        >
            Time of Day
        </button>
        <button
            class="tab-button"
            class:active={activeTab === 'sensor-data'}
            on:click={() => activeTab = 'sensor-data'}
        >
            Sensor Data
        </button>
        <button
            class="tab-button"
            class:active={activeTab === 'distance'}
            on:click={() => activeTab = 'distance'}
        >
            Distance Analysis
        </button>
        <button
            class="tab-button"
            class:active={activeTab === 'raw-data'}
            on:click={() => activeTab = 'raw-data'}
        >
            Raw Data
        </button>
    </nav>

    <!-- Content Area -->
    <main class="dashboard-content">
        {#if activeTab === 'time-of-day'}
            <div class="chart-container">
                <h2>Time of Day Distribution</h2>
                <TodVisualization {config} />
            </div>
        {:else if activeTab === 'sensor-data'}
            <div class="chart-container">
                <h2>Most Data Collected by Sensor</h2>
                {#if sensors && Array.isArray(sensors) && config2}
                    <MostDataPiechart {config2} />
                {/if}
            </div>
        {:else if activeTab === 'distance'}
            <div class="chart-container">
                <h2>Distance Analysis</h2>
                <div class="charts-grid">
                    <div>
                        <h3>Distance Distribution Boxplot</h3>
                        <MostTravelBoxplot sensorData={distances[2]}/>
                    </div>
                    <div>
                        <h3>Distance by Sensor Bar Chart</h3>
                        <MostTravelBarChart {config3}/>
                    </div>
                </div>
            </div>
        {:else if activeTab === 'raw-data'}
            <div class="data-container">
                <h2>Raw Data View</h2>
                <div class="data-grid">
                    <div class="data-card">
                        <h3>Bins Data</h3>
                        <pre>{JSON.stringify(bins, null, 2)}</pre>
                    </div>
                    <div class="data-card">
                        <h3>Log IDs</h3>
                        <pre>{JSON.stringify(logids, null, 2)}</pre>
                    </div>
                    <div class="data-card">
                        <h3>Times of Day</h3>
                        <pre>{JSON.stringify(times_of_day, null, 2)}</pre>
                    </div>
                    <div class="data-card">
                        <h3>Sensors Data</h3>
                        <pre>{JSON.stringify(sensors, null, 2)}</pre>
                    </div>
                </div>
                {#if jsonData}
                    <div class="data-card full-width">
                        <h3>Complete JSON Data (Total entries: {Object.keys(jsonData).length})</h3>
                        <pre>{JSON.stringify(jsonData, null, 2)}</pre>
                    </div>
                {/if}
            </div>
        {/if}
    </main>
</div>

<style>
    .dashboard-container {
        min-height: 100vh;
        background-color: #f5f5f5;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }

    .dashboard-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 2rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .dashboard-header h1 {
        margin: 0;
        font-size: 2rem;
        font-weight: 600;
    }

    .timestamp {
        margin-top: 0.5rem;
        opacity: 0.9;
        font-size: 0.9rem;
    }

    .tab-navigation {
        background: white;
        padding: 1rem 2rem;
        display: flex;
        gap: 1rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        overflow-x: auto;
    }

    .tab-button {
        padding: 0.75rem 1.5rem;
        background: transparent;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 500;
        color: #333;
        transition: all 0.3s ease;
        white-space: nowrap;
    }

    .tab-button:hover {
        background: #f0f0f0;
        border-color: #667eea;
    }

    .tab-button.active {
        background: #667eea;
        color: white;
        border-color: #667eea;
    }

    .dashboard-content {
        padding: 2rem;
        max-width: 1400px;
        margin: 0 auto;
    }

    .chart-container {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .chart-container h2 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        color: #333;
        font-size: 1.5rem;
    }

    .chart-container h3 {
        margin-top: 1.5rem;
        margin-bottom: 1rem;
        color: #555;
        font-size: 1.2rem;
    }

    .charts-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
    }

    @media (min-width: 768px) {
        .charts-grid {
            grid-template-columns: 1fr 1fr;
        }
    }

    .data-container {
        background: white;
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .data-container h2 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        color: #333;
    }

    .data-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
        margin-bottom: 2rem;
    }

    @media (min-width: 768px) {
        .data-grid {
            grid-template-columns: 1fr 1fr;
        }
    }

    .data-card {
        background: #f8f9fa;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 1.5rem;
    }

    .data-card h3 {
        margin-top: 0;
        margin-bottom: 1rem;
        color: #555;
        font-size: 1.1rem;
    }

    .data-card pre {
        background: white;
        padding: 1rem;
        border-radius: 4px;
        overflow-x: auto;
        font-size: 0.85rem;
        max-height: 300px;
        overflow-y: auto;
    }

    .data-card.full-width {
        grid-column: 1 / -1;
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
        .dashboard-header {
            padding: 1.5rem 1rem;
        }

        .dashboard-header h1 {
            font-size: 1.5rem;
        }

        .tab-navigation {
            padding: 1rem;
        }

        .tab-button {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
        }

        .dashboard-content {
            padding: 1rem;
        }

        .chart-container,
        .data-container {
            padding: 1.5rem 1rem;
        }
    }
</style>