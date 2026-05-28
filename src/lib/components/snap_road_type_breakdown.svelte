<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    let { snapData, selectedRoute, selectedTrip } = $props();
    const routeIds = Object.keys(snapData);

    const TYPE_PALETTE = [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)',
        'rgba(83, 102, 255, 0.7)',
        'rgba(255, 102, 178, 0.7)',
        'rgba(102, 204, 153, 0.7)'
    ];

    let countsByType = $derived.by(() => {
        const routes = selectedRoute ? [selectedRoute] : routeIds;
        const counts = new Map();
        for (const r of routes) {
            const trips = snapData[r];
            if (!trips) continue;
            const target = (r === selectedRoute && selectedTrip)
                ? trips.filter((t) => Object.keys(t)[0] === selectedTrip)
                : trips;
            for (const t of target) {
                const key = Object.keys(t)[0];
                for (const p of t[key]) {
                    if (!p.snapped) continue;
                    const hw = p.snappedRoad?.highway ?? 'unknown';
                    counts.set(hw, (counts.get(hw) ?? 0) + 1);
                }
            }
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        return {
            labels: sorted.map(([k]) => k),
            data: sorted.map(([, v]) => v)
        };
    });

    let canvas;
    let chart = null;

    onMount(() => {
        let cancelled = false;
        import('chart.js/auto').then((ChartModule) => {
            if (cancelled || !canvas) return;
            const Chart = ChartModule.default;
            chart = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: countsByType.labels,
                    datasets: [{
                        label: 'Snapped points',
                        data: countsByType.data,
                        backgroundColor: countsByType.labels.map((_, i) => TYPE_PALETTE[i % TYPE_PALETTE.length]),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'right' },
                        title: { display: true, text: 'Snapped road-type breakdown' },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                                    return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
                                }
                            }
                        }
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
        const { labels, data } = countsByType;
        if (!chart) return;
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.data.datasets[0].backgroundColor = labels.map((_, i) => TYPE_PALETTE[i % TYPE_PALETTE.length]);
        chart.update();
    });
</script>

<div class="relative h-full w-full">
    {#if browser}
        <canvas bind:this={canvas}></canvas>
    {/if}
</div>
