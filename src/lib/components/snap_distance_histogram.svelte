<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    let { snapData, selectedRoute, selectedTrip } = $props();

    const BIN_WIDTH = 5;
    const MAX_BIN_EDGE = 100;

    const PALETTE = [
        { bg: 'rgba(255, 99, 132, 0.5)', border: 'rgba(255, 99, 132, 1)' },
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' },
        { bg: 'rgba(255, 206, 86, 0.5)', border: 'rgba(255, 206, 86, 1)' },
        { bg: 'rgba(75, 192, 192, 0.5)', border: 'rgba(75, 192, 192, 1)' },
        { bg: 'rgba(153, 102, 255, 0.5)', border: 'rgba(153, 102, 255, 1)' },
        { bg: 'rgba(255, 159, 64, 0.5)', border: 'rgba(255, 159, 64, 1)' }
    ];

    const routeIds = Object.keys(snapData);

    const labels = (() => {
        const nBins = MAX_BIN_EDGE / BIN_WIDTH;
        const lbls = [];
        for (let i = 0; i < nBins; i++) lbls.push(`${i * BIN_WIDTH}–${(i + 1) * BIN_WIDTH}`);
        lbls.push(`${MAX_BIN_EDGE}+`);
        return lbls;
    })();

    function binDistances(distArr) {
        const nBins = MAX_BIN_EDGE / BIN_WIDTH;
        const counts = new Array(nBins + 1).fill(0);
        for (const d of distArr) {
            const idx = d >= MAX_BIN_EDGE ? nBins : Math.floor(d / BIN_WIDTH);
            counts[idx]++;
        }
        return counts;
    }

    function distancesForRoute(route) {
        const out = [];
        const trips = snapData[route];
        if (!trips) return out;
        const target = (route === selectedRoute && selectedTrip)
            ? trips.filter((t) => Object.keys(t)[0] === selectedTrip)
            : trips;
        for (const t of target) {
            const key = Object.keys(t)[0];
            for (const p of t[key]) {
                if (p.snapped && typeof p.snapDistance === 'number') out.push(p.snapDistance);
            }
        }
        return out;
    }

    let datasets = $derived.by(() => {
        if (selectedRoute) {
            return [{
                label: `${selectedRoute} snapped points`,
                data: binDistances(distancesForRoute(selectedRoute)),
                backgroundColor: 'rgba(251, 92, 30, 0.7)',
                borderColor: '#FB5C1E',
                borderWidth: 1
            }];
        }
        return routeIds.map((r, i) => {
            const c = PALETTE[i % PALETTE.length];
            return {
                label: r,
                data: binDistances(distancesForRoute(r)),
                backgroundColor: c.bg,
                borderColor: c.border,
                borderWidth: 1
            };
        });
    });

    let canvas;
    let chart = null;

    onMount(() => {
        let cancelled = false;
        import('chart.js/auto').then((ChartModule) => {
            if (cancelled || !canvas) return;
            const Chart = ChartModule.default;
            chart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'Snap distance distribution' }
                    },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Number of points' } },
                        x: { title: { display: true, text: 'Snap distance (meters)' } }
                    }
                }
            });
        });
        return () => {
            cancelled = true;
            if (chart) { chart.destroy(); chart = null; }
        };
    });

    $effect(() => {
        const ds = datasets;
        if (!chart) return;
        chart.data.datasets = ds;
        chart.update();
    });
</script>

<div class="relative h-full w-full">
    {#if browser}
        <canvas bind:this={canvas}></canvas>
    {/if}
</div>
