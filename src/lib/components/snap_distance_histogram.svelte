<script>
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    let { snapData } = $props();

    const BIN_WIDTH = 5;
    const MAX_BIN_EDGE = 100;

    const routeIds = Object.keys(snapData);
    let selectedRoute = $state(routeIds[0] ?? '');
    let selectedTrip = $state('');

    let tripIds = $derived(
        selectedRoute && snapData[selectedRoute]
            ? snapData[selectedRoute].map(t => Object.keys(t)[0])
            : []
    );

    function onRouteChange() {
        selectedTrip = '';
    }

    let dists = $derived.by(() => {
        if (!selectedRoute || !snapData[selectedRoute]) return [];
        const trips = snapData[selectedRoute];
        const target = selectedTrip
            ? trips.filter(t => Object.keys(t)[0] === selectedTrip)
            : trips;
        const out = [];
        for (const t of target) {
            const key = Object.keys(t)[0];
            for (const p of t[key]) {
                if (p.snapped && typeof p.snapDistance === 'number') out.push(p.snapDistance);
            }
        }
        return out;
    });

    let bins = $derived.by(() => {
        const nBins = MAX_BIN_EDGE / BIN_WIDTH;
        const counts = new Array(nBins + 1).fill(0);
        for (const d of dists) {
            const idx = d >= MAX_BIN_EDGE ? nBins : Math.floor(d / BIN_WIDTH);
            counts[idx]++;
        }
        const labels = [];
        for (let i = 0; i < nBins; i++) labels.push(`${i * BIN_WIDTH}–${(i + 1) * BIN_WIDTH}`);
        labels.push(`${MAX_BIN_EDGE}+`);
        return { labels, counts };
    });

    let stats = $derived.by(() => {
        if (dists.length === 0) return null;
        const sorted = [...dists].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        return {
            count: sorted.length,
            mean: sum / sorted.length,
            median: pct(0.5),
            p95: pct(0.95),
            max: sorted[sorted.length - 1]
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
                type: 'bar',
                data: {
                    labels: bins.labels,
                    datasets: [{
                        label: 'Snapped points',
                        data: bins.counts,
                        backgroundColor: 'rgba(251, 92, 30, 0.7)',
                        borderColor: '#FB5C1E',
                        borderWidth: 1
                    }]
                },
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
        const labels = bins.labels;
        const counts = bins.counts;
        if (!chart) return;
        chart.data.labels = labels;
        chart.data.datasets[0].data = counts;
        chart.update();
    });

    function fmt(n) {
        return n.toFixed(2);
    }
</script>

<div class="flex flex-col h-full gap-4">
    <div class="flex gap-4 flex-wrap items-end">
        <label class="form-control">
            <span class="label-text text-xs mb-1">Route</span>
            <select class="select select-bordered select-sm" bind:value={selectedRoute} onchange={onRouteChange}>
                {#each routeIds as r}
                    <option value={r}>{r}</option>
                {/each}
            </select>
        </label>
        <label class="form-control">
            <span class="label-text text-xs mb-1">Trip</span>
            <select class="select select-bordered select-sm" bind:value={selectedTrip}>
                <option value="">All trips</option>
                {#each tripIds as t}
                    <option value={t}>{t}</option>
                {/each}
            </select>
        </label>
    </div>

    <div class="flex flex-1 min-h-0 gap-4">
        <div class="flex-1 min-h-0 bg-base-100 rounded-lg p-4">
            {#if browser}
                <div class="relative h-full w-full">
                    <canvas bind:this={canvas}></canvas>
                </div>
            {/if}
        </div>

        <div class="w-56 flex flex-col gap-2">
            {#if stats}
                <div class="stat bg-base-100 rounded-lg p-3">
                    <div class="stat-title text-xs">Count</div>
                    <div class="stat-value text-xl">{stats.count}</div>
                </div>
                <div class="stat bg-base-100 rounded-lg p-3">
                    <div class="stat-title text-xs">Mean</div>
                    <div class="stat-value text-xl">{fmt(stats.mean)} m</div>
                </div>
                <div class="stat bg-base-100 rounded-lg p-3">
                    <div class="stat-title text-xs">Median</div>
                    <div class="stat-value text-xl">{fmt(stats.median)} m</div>
                </div>
                <div class="stat bg-base-100 rounded-lg p-3">
                    <div class="stat-title text-xs">p95</div>
                    <div class="stat-value text-xl">{fmt(stats.p95)} m</div>
                </div>
                <div class="stat bg-base-100 rounded-lg p-3">
                    <div class="stat-title text-xs">Max</div>
                    <div class="stat-value text-xl">{fmt(stats.max)} m</div>
                </div>
            {:else}
                <div class="stat bg-base-100 rounded-lg p-3">
                    <div class="stat-title text-xs">No snapped points in selection</div>
                </div>
            {/if}
        </div>
    </div>
</div>
