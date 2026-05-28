<script>
    import SnapDistanceHistogram from './snap_distance_histogram.svelte';
    import SnapRoadTypeBreakdown from './snap_road_type_breakdown.svelte';
    import SnapVsAccuracyScatter from './snap_vs_accuracy_scatter.svelte';

    let { snapData } = $props();

    const routeIds = Object.keys(snapData);
    let selectedRoute = $state(routeIds[0] ?? '');
    let selectedTrip = $state('');
    let subTab = $state('histogram');

    let tripIds = $derived(
        selectedRoute && snapData[selectedRoute]
            ? snapData[selectedRoute].map((t) => Object.keys(t)[0])
            : []
    );

    function onRouteChange() {
        selectedTrip = '';
    }

    let dists = $derived.by(() => {
        const out = [];
        const routes = selectedRoute ? [selectedRoute] : routeIds;
        for (const r of routes) {
            const trips = snapData[r];
            if (!trips) continue;
            const target = (selectedRoute && selectedTrip)
                ? trips.filter((t) => Object.keys(t)[0] === selectedTrip)
                : trips;
            for (const t of target) {
                const key = Object.keys(t)[0];
                for (const p of t[key]) {
                    if (p.snapped && typeof p.snapDistance === 'number') out.push(p.snapDistance);
                }
            }
        }
        return out;
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

    function fmt(n) {
        return n.toFixed(2);
    }
</script>

<div class="flex flex-col h-full gap-4">
    <div class="flex gap-4 flex-wrap items-end">
        <label class="form-control">
            <span class="label-text text-xs mb-1">Route</span>
            <select
                class="select select-bordered select-sm"
                bind:value={selectedRoute}
                onchange={onRouteChange}
            >
                <option value="">All routes</option>
                {#each routeIds as r}
                    <option value={r}>{r}</option>
                {/each}
            </select>
        </label>
        <label class="form-control">
            <span class="label-text text-xs mb-1">Trip</span>
            <select
                class="select select-bordered select-sm"
                bind:value={selectedTrip}
                disabled={!selectedRoute}
            >
                <option value="">All trips</option>
                {#each tripIds as t}
                    <option value={t}>{t}</option>
                {/each}
            </select>
        </label>

        <div role="tablist" class="tabs tabs-boxed">
            <button
                role="tab"
                class="tab"
                class:tab-active={subTab === 'histogram'}
                onclick={() => (subTab = 'histogram')}
            >
                Histogram
            </button>
            <button
                role="tab"
                class="tab"
                class:tab-active={subTab === 'road-type'}
                onclick={() => (subTab = 'road-type')}
            >
                Road type
            </button>
            <button
                role="tab"
                class="tab"
                class:tab-active={subTab === 'scatter'}
                onclick={() => (subTab = 'scatter')}
            >
                Accuracy scatter
            </button>
        </div>
    </div>

    <div class="flex flex-1 min-h-0 gap-4">
        <div class="flex-1 min-h-0 bg-base-100 rounded-lg p-4">
            {#if subTab === 'histogram'}
                <SnapDistanceHistogram {snapData} {selectedRoute} {selectedTrip} />
            {:else if subTab === 'road-type'}
                <SnapRoadTypeBreakdown {snapData} {selectedRoute} {selectedTrip} />
            {:else if subTab === 'scatter'}
                <SnapVsAccuracyScatter {snapData} {selectedRoute} {selectedTrip} />
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
