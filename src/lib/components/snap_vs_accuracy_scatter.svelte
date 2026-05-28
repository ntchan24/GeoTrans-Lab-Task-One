<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    let { snapData, selectedRoute, selectedTrip } = $props();
    const routeIds = Object.keys(snapData);

    const PALETTE = [
        { bg: 'rgba(255, 99, 132, 0.5)', border: 'rgba(255, 99, 132, 1)' },
        { bg: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' },
        { bg: 'rgba(255, 206, 86, 0.5)', border: 'rgba(255, 206, 86, 1)' },
        { bg: 'rgba(75, 192, 192, 0.5)', border: 'rgba(75, 192, 192, 1)' },
        { bg: 'rgba(153, 102, 255, 0.5)', border: 'rgba(153, 102, 255, 1)' },
        { bg: 'rgba(255, 159, 64, 0.5)', border: 'rgba(255, 159, 64, 1)' }
    ];

    const SAMPLE_CAP = 5000;

    function sampleArray(arr, cap) {
        if (arr.length <= cap) return arr;
        const out = new Array(cap);
        const step = arr.length / cap;
        for (let i = 0; i < cap; i++) out[i] = arr[Math.floor(i * step)];
        return out;
    }

    let datasets = $derived.by(() => {
        const routes = selectedRoute ? [selectedRoute] : routeIds;
        const perRouteCap = Math.max(200, Math.floor(SAMPLE_CAP / routes.length));
        return routes.map((r) => {
            const trips = snapData[r];
            if (!trips) return null;
            const target = (r === selectedRoute && selectedTrip)
                ? trips.filter((t) => Object.keys(t)[0] === selectedTrip)
                : trips;
            const points = [];
            for (const t of target) {
                const key = Object.keys(t)[0];
                for (const p of t[key]) {
                    if (p.snapped && typeof p.snapDistance === 'number' && typeof p.accuracy === 'number') {
                        points.push({ x: p.accuracy, y: p.snapDistance });
                    }
                }
            }
            const sampled = sampleArray(points, perRouteCap);
            const idx = routeIds.indexOf(r);
            const c = PALETTE[idx % PALETTE.length];
            return {
                label: r,
                data: sampled,
                backgroundColor: c.bg,
                borderColor: c.border,
                pointRadius: 3,
                pointHoverRadius: 5
            };
        }).filter(Boolean);
    });

    let canvas;
    let chart = null;

    onMount(() => {
        let cancelled = false;
        import('chart.js/auto').then((ChartModule) => {
            if (cancelled || !canvas) return;
            const Chart = ChartModule.default;
            chart = new Chart(canvas.getContext('2d'), {
                type: 'scatter',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: 'Snap distance vs GPS accuracy' }
                    },
                    scales: {
                        x: { title: { display: true, text: 'GPS accuracy (meters)' }, beginAtZero: true },
                        y: { title: { display: true, text: 'Snap distance (meters)' }, beginAtZero: true }
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
