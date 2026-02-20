<!-- Chart.js component for time-of-day histogram visualization -->
<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let config3;

	let canvas;
	let chart = null;
	let chartContainer;

	onMount(() => {
		// Dynamically import Chart.js to avoid SSR issues
		import('chart.js/auto').then((ChartModule) => {
			const Chart = ChartModule.default;

			console.log('Initializing chart with config:', config3);

			if (canvas && config3) {
				const ctx = canvas.getContext('2d');

				// Create the chart
				chart = new Chart(ctx, {
					...config3,
					options: {
						...config3.options,
						responsive: true,
						maintainAspectRatio: false
					}
				});

				console.log('Chart created successfully');
			}
		});

		// Cleanup function
		return () => {
			if (chart) {
				console.log('Destroying chart');
				chart.destroy();
				chart = null;
			}
		};
	});
</script>

<style>
	.chart-container {
		position: relative;
		height: 400px;
		width: 100%;
		margin: 20px 0;
	}
</style>

<div class="chart-container" bind:this={chartContainer}>
	{#if browser}
		<canvas bind:this={canvas}></canvas>
	{:else}
		<div>Loading chart...</div>
	{/if}
</div>