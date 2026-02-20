<!-- boxplot to figure out which sensors travelled the farthest -->
<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  export let sensorData = {};

  let canvas;
  let chart = null;
  let chartContainer;

  onMount(() => {
    // Dynamically import Chart.js and boxplot plugin to avoid SSR issues
    Promise.all([
      import('chart.js/auto'),
      import('@sgratzl/chartjs-chart-boxplot')
    ]).then(([ChartModule, BoxplotModule]) => {
      const Chart = ChartModule.default;
      const { BoxPlotController, BoxAndWiskers } = BoxplotModule;

      // Manually register the boxplot controller and elements with Chart.js
      Chart.register(BoxPlotController, BoxAndWiskers);

      console.log('Boxplot component mounted with sensorData:', sensorData);

      const labels = Object.keys(sensorData);
      const data = labels.map(label => sensorData[label]);

      console.log('Labels for boxplot:', labels);
      console.log('Data arrays for boxplot:', data);

      if (canvas && sensorData && Object.keys(sensorData).length > 0) {
        const ctx = canvas.getContext('2d');

        try {
          chart = new Chart(ctx, {
            type: 'boxplot',
            data: {
              labels: labels,
              datasets: [{
                label: 'Distance Travelled (km)',
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.3)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: {
                  display: true,
                  position: 'top'
                },
                tooltip: { enabled: true },
                title: {
                  display: true,
                  text: 'Distance Distribution by Sensor'
                }
              },
              scales: {
                y: {
                  title: {
                    display: true,
                    text: 'Distance (km)'
                  },
                  beginAtZero: true,
                  // Set a fixed scale range
                  min: 0,      // Minimum value on Y-axis
                  max: 1,    // Maximum value on Y-axis (adjust as needed)
                  // Or use suggestedMin/suggestedMax for flexible bounds
                  // suggestedMin: 0,
                  // suggestedMax: 50
                },
                x: {
                  title: {
                    display: true,
                    text: 'Sensor / Vehicle'
                  }
                }
              }
            }
          });

          console.log('Boxplot chart created successfully');
        } catch (error) {
          console.error('Error creating boxplot chart:', error);
        }
      } else {
        console.warn('Cannot create boxplot: missing canvas or sensorData');
      }
    }).catch(error => {
      console.error('Error loading Chart.js modules:', error);
    });

    // Cleanup on unmount
    return () => {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    };
  });
</script>

{#if browser}
  <div bind:this={chartContainer} style="height: 400px; width: 100%; position: relative;">
    <canvas bind:this={canvas}></canvas>
  </div>
{/if}