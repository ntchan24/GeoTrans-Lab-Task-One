<!-- clone of map_plot, for map snapping  -->

<!-- dropdown for the different trips, render based on the trip -->
<!-- map with lines and points  -->
<script>

  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import * as turf from '@turf/turf';
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import Switch from './Switch.svelte';
  // this is for the toggle switch

 //initialize the value from the url bc it changes when you interact with the toggle switch
  let switchvalue = $state($page.url.searchParams.get('mode') ?? 'original');

  // Initialize weight parameters from URL - these are the "applied" weights
  let appliedHeadingWeight = Number($page.url.searchParams.get('headingWeight') ?? 0.05);
  let appliedNeighborWeight = Number($page.url.searchParams.get('neighborWeight') ?? 0.90);
  let appliedRoadTypePriorityWeight = Number($page.url.searchParams.get('roadTypePriorityWeight') ?? 0.05);

  // Pending weights that the sliders modify (start with applied values)
  let headingWeight = $state(appliedHeadingWeight);
  let neighborWeight = $state(appliedNeighborWeight);
  let roadTypePriorityWeight = $state(appliedRoadTypePriorityWeight);

  // Track whether weights have been changed but not applied
  let hasUnappliedChanges = $derived(
    Math.abs(headingWeight - appliedHeadingWeight) > 0.001 ||
    Math.abs(neighborWeight - appliedNeighborWeight) > 0.001 ||
    Math.abs(roadTypePriorityWeight - appliedRoadTypePriorityWeight) > 0.001
  );

  // Function to adjust weights when one slider changes
  function adjustWeights(changedWeight, newValue) {
    const oldValue = changedWeight === 'heading' ? headingWeight :
                     changedWeight === 'neighbor' ? neighborWeight : roadTypePriorityWeight;

    const delta = newValue - oldValue;
    const remaining = 1.0 - newValue;

    if (changedWeight === 'heading') {
      headingWeight = newValue;

      if (remaining === 0) {
        // If set to 1, others must be 0
        neighborWeight = 0;
        roadTypePriorityWeight = 0;
      } else if (neighborWeight + roadTypePriorityWeight > 0) {
        // Distribute proportionally based on current values
        const ratio = neighborWeight / (neighborWeight + roadTypePriorityWeight);
        neighborWeight = remaining * ratio;
        roadTypePriorityWeight = remaining * (1 - ratio);
      } else {
        // If both others are 0, distribute equally
        neighborWeight = remaining / 2;
        roadTypePriorityWeight = remaining / 2;
      }
    } else if (changedWeight === 'neighbor') {
      neighborWeight = newValue;

      if (remaining === 0) {
        headingWeight = 0;
        roadTypePriorityWeight = 0;
      } else if (headingWeight + roadTypePriorityWeight > 0) {
        const ratio = headingWeight / (headingWeight + roadTypePriorityWeight);
        headingWeight = remaining * ratio;
        roadTypePriorityWeight = remaining * (1 - ratio);
      } else {
        headingWeight = remaining / 2;
        roadTypePriorityWeight = remaining / 2;
      }
    } else if (changedWeight === 'roadType') {
      roadTypePriorityWeight = newValue;

      if (remaining === 0) {
        headingWeight = 0;
        neighborWeight = 0;
      } else if (headingWeight + neighborWeight > 0) {
        const ratio = headingWeight / (headingWeight + neighborWeight);
        headingWeight = remaining * ratio;
        neighborWeight = remaining * (1 - ratio);
      } else {
        headingWeight = remaining / 2;
        neighborWeight = remaining / 2;
      }
    }

    // No longer automatically update URL - wait for Apply button
  }

  async function applyWeights() {
    // Update the applied weights to match pending weights
    appliedHeadingWeight = headingWeight;
    appliedNeighborWeight = neighborWeight;
    appliedRoadTypePriorityWeight = roadTypePriorityWeight;

    // Update URL and reload data
    await updateWeightsInURL();
  }

  async function resetWeights() {
    // Reset pending weights to the applied values
    headingWeight = appliedHeadingWeight;
    neighborWeight = appliedNeighborWeight;
    roadTypePriorityWeight = appliedRoadTypePriorityWeight;
  }

  async function updateWeightsInURL() {
    const params = new URLSearchParams($page.url.searchParams);
    params.set('headingWeight', headingWeight.toFixed(2));
    params.set('neighborWeight', neighborWeight.toFixed(2));
    params.set('roadTypePriorityWeight', roadTypePriorityWeight.toFixed(2));

    // Log to browser console for debugging
    console.log('Applying weights to map:', {
      headingWeight: headingWeight.toFixed(2),
      neighborWeight: neighborWeight.toFixed(2),
      roadTypePriorityWeight: roadTypePriorityWeight.toFixed(2),
      sum: (headingWeight + neighborWeight + roadTypePriorityWeight).toFixed(2)
    });

    // Navigate and then invalidate all data to force a reload
    await goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: false });
    await invalidateAll();
  }

  function updateMode(value) {
    const params = new URLSearchParams($page.url.searchParams);

    //page.url.searchParams is the current URL query string.
    //wrap in a new URLsearchparams so we can change it without changing the url
    // conceptually:
    // {
    //   'threshold': '0.7',
    //   'zoom': '12'
    // }
    params.set('mode', value);

    // Preserve route and trip selections when switching modes
    if (selectedRoute) {
      params.set('route', selectedRoute);
    }
    if (selectedTrip) {
      params.set('trip', selectedTrip);
    }

    goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: true });

  }
 //rerun to refresh whenever switchvalue changes
 $effect(() => {
  const currentMode = $page.url.searchParams.get('mode') ?? 'original';
  if (switchvalue !== currentMode) {
    updateMode(switchvalue);
  }
 });


  const MAPTILER_KEY =  "UHv14Wh0RtdXjkmopUTK";

  let map;
  let mapContainer;

  let { mapMatch } = $props();//receive props from page.svelte, this is the map matched data

  console.log("props received")
  // Function to get the selected trip data
  function getSelectedTripData() {
    //all the return nulls are checks to not return bad data 
    if (!selectedRoute || !selectedTrip || !mapMatch){
      return null
    } else {
      console.log("props received")
    }

    const routeData = mapMatch[selectedRoute];
    if (!routeData) return null;

    // Find the trip object with the matching trip ID
    const tripObj = routeData.find(trip => Object.keys(trip)[0] === selectedTrip); //each trip object has one key (logid) 
    if (!tripObj) return null;

    return tripObj[selectedTrip];
  }

  // Function to create GeoJSON from trip data
  function createGeoJSONFromTrip(tripData) {
    if (!tripData || tripData.length === 0) {
      // Return empty FeatureCollection if no data
      return turf.featureCollection([]);
    }

    const features = [];
    const lineCoordinates = [];

    // Create points and collect coordinates for the line
    tripData.forEach((point, index) => {
      //  [lng, lat] for GeoJSON
      const coords = [point.coords[1], point.coords[0]];
      lineCoordinates.push(coords);

      
      const pointFeature = turf.point(coords, {
        index: index,
        accuracy: point.accuracy,
        time: point.time,
        coords: `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`,
        ...(point.distancetoNext && { distanceToNext: `${point.distancetoNext.toFixed(3)} km` }),
        ...(point.speedBetweenNext && { speed: `${(point.speedBetweenNext).toFixed(1)} km/h` }),
        snapped: point.snapped || false,
        snappedRoad : point.snappedRoad ? JSON.stringify(point.snappedRoad) : null
        //this uses the spread operator , this is an alternative to just assigning the variable
      });

      features.push(pointFeature);
    });

    // Create line if we have at least 2 points
    if (lineCoordinates.length >= 2) {
      const lineFeature = turf.lineString(lineCoordinates, {
        name: `${selectedRoute} - ${selectedTrip}`,
        totalDistance: `${turf.length(turf.lineString(lineCoordinates), { units: 'kilometers' }).toFixed(2)} km`
      });
      features.push(lineFeature);
    }

    return turf.featureCollection(features);
  }

  // Function to update map data
  function updateMapData() {
    if (!map || !map.loaded()) return;

    const tripData = getSelectedTripData();
    const geojsonData = createGeoJSONFromTrip(tripData);

    // Log snapped points for debugging
    if (tripData && switchvalue === 'snapped') {
      const snappedPoints = tripData.filter(p => p.snapped);
      console.log(`Found ${snappedPoints.length} snapped points out of ${tripData.length} total points`);

      // Log a sample of snapped points to see coordinate changes
      if (snappedPoints.length > 0) {
        console.log('Sample snapped point:', {
          coords: snappedPoints[0].coords,
          accuracy: snappedPoints[0].accuracy,
          snappedRoad: snappedPoints[0].snappedRoad?.name || snappedPoints[0].snappedRoad?.id
        });
      }
    }

    // Update the source data
    const source = map.getSource('route-data');
    if (source) {
      source.setData(geojsonData);

      // Fit map bounds to the new data if there are features
      if (geojsonData.features.length > 0 && tripData && tripData.length > 0) {
        const bounds = turf.bbox(geojsonData);
        map.fitBounds(bounds, {
          padding: 50,
          duration: 1000
        });
      }
    }
  }

  onMount(() => {

    
    // Initialize with empty FeatureCollection
    const geojsonData = turf.featureCollection([]);


    const initialState = {lat: 53.546206, lng: -113.491241, zoom: 13};

    map = new maplibregl.Map({
      container: mapContainer,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      center: [initialState.lng,initialState.lat],
      zoom: initialState.zoom
    })


    map.on('error', (e) => {
      console.error('Map error:', e.error);
    });

    map.on('load', () => {
      console.log('Map loaded successfully');

      // Add the Turf.js GeoJSON data as a map source
      map.addSource('route-data', {
        type: 'geojson',
        data: geojsonData
      });
    

    // Add Line Layer
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-data',
      filter: ['==', '$type', 'LineString'], // Only style the line
      paint: {
        'line-color': '#ff5a5f',
        'line-width': 5
      }
    });

    // Add Points Layer with conditional styling for snapped points
    map.addLayer({
      id: 'route-points',
      type: 'circle',
      source: 'route-data',
      filter:['==', '$type', 'Point'], // Only style the points
      paint: {
        'circle-radius': 8,
        'circle-color': [
          'case',
          ['get', 'snapped'],
          '#ff5a5f',  // Red for snapped points
          '#007cbf'   // Blue for unsnapped points
        ],
        'circle-stroke-width': [
          'case',
          ['get', 'snapped'],
          3,  // Thicker border for snapped points
          2   // Normal border for unsnapped
        ],
        'circle-stroke-color': '#ffffff'
      }
    });


    // Create a popup, but don't add it to the map yet.
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
      });

      // --- Hover behavior for POINTS ---
      map.on('mouseenter', 'route-points', (e) => {
        map.getCanvas().style.cursor = 'pointer';

        // Extract properties populated via Turf.js
        const { index, coords, accuracy, time, distanceToNext, speed, snapped, snappedRoad } = e.features[0].properties;
        const coordinates = e.features[0].geometry.coordinates.slice();

        const htmlContent = `
          <div style="color: black;">
            <strong>Point ${index}</strong><br>
            Coordinates: ${coords}<br>
            Accuracy: ${accuracy?.toFixed(2) || 'N/A'} m<br>
            Time: ${time ? new Date(time).toLocaleString() : 'N/A'}
            ${distanceToNext ? `<br>Distance to next: ${distanceToNext}` : ''}
            ${speed ? `<br>Speed: ${speed}` : ''} <br>
            Snapped: ${snapped} <br>
            ${snappedRoad ? `SnappedRoad: ${JSON.parse(snappedRoad).name || JSON.parse(snappedRoad).id || 'Unknown'}` : 'Not snapped'}
          </div>
        `;

        popup.setLngLat(coordinates).setHTML(htmlContent).addTo(map);
      });

      map.on('mouseleave', 'route-points', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      // --- Hover behavior for the LINE ---
      // We use mousemove so the popup follows the cursor along the line
      map.on('mousemove', 'route-line', (e) => {
        map.getCanvas().style.cursor = 'pointer';

        // Extract properties populated via Turf.js
        const { name, totalDistance } = e.features[0].properties;

        const htmlContent = `
          <div style="color: black;">
            <strong>${name || 'Route'}</strong><br>
            Total Distance: ${totalDistance || 'N/A'}
          </div>
        `;

        // e.lngLat is the exact point of the cursor over the line
        popup.setLngLat(e.lngLat).setHTML(htmlContent).addTo(map);
      });

      map.on('mouseleave', 'route-line', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      // Update map with initially selected trip if any
      if (selectedTrip) {
        updateMapData();
      }
    })
  })



  //runs when the website is closed , destroy component
    onDestroy(() => {
    if (map) map.remove();
  });

  // Initialize from URL parameters to preserve selections across mode switches
  let selectedRoute = $state($page.url.searchParams.get('route') ?? '');
  let selectedTrip = $state($page.url.searchParams.get('trip') ?? '');

  // Debug when route changes
  $effect(() => {
    console.log('selectedRoute value:', selectedRoute, 'type:', typeof selectedRoute);
  });

  // Get available routes (SE, NW, CENTRAL, RWIS, RWIS_SW)
  let availableRoutes = $derived(mapMatch ? Object.keys(mapMatch) : []);

  // Get available trips for the selected route
  let availableTrips = $derived(
    selectedRoute && mapMatch && mapMatch[selectedRoute]
      ? mapMatch[selectedRoute].map(tripObj => Object.keys(tripObj)[0])
      : []
  );
  // Track previous route to detect actual route changes
  let previousRoute = $state('');

  //run this when any variable inside it changes
    //svelte reactive statement
  $effect(()=> {
    console.log('Route changed to:', selectedRoute);
    console.log('Available trips:', availableTrips);
    // Only clear trip selection when route actually changes to a different value
    // not when component re-renders with same route
    if (selectedRoute && selectedRoute !== previousRoute) {
      selectedTrip = '';
      previousRoute = selectedRoute;
    }
  });

  // Update URL when route selection changes
  $effect(() => {
    const currentRouteInUrl = $page.url.searchParams.get('route') ?? '';
    if (selectedRoute !== currentRouteInUrl) {
      const params = new URLSearchParams($page.url.searchParams);
      if (selectedRoute) {
        params.set('route', selectedRoute);
      } else {
        params.delete('route');
      }
      // Clear trip from URL when route changes
      if (selectedRoute !== previousRoute) {
        params.delete('trip');
      }
      goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: true });
    }
  });

  // Update URL when trip selection changes
  $effect(() => {
    const currentTripInUrl = $page.url.searchParams.get('trip') ?? '';
    if (selectedTrip !== currentTripInUrl) {
      const params = new URLSearchParams($page.url.searchParams);
      if (selectedTrip) {
        params.set('trip', selectedTrip);
      } else {
        params.delete('trip');
      }
      goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: true });
    }
  });

  // Update map when trip selection changes
  $effect(() => {
    if (selectedTrip) {
      console.log('Updating map for trip:', selectedTrip);
      updateMapData();
    } else if (map && map.loaded()) {
      // Clear map when no trip is selected
      const source = map.getSource('route-data');
      if (source) {
        source.setData(turf.featureCollection([]));
      }
    }
  });

</script>

<div class="py-4">

  <div class="px-4 py-2">
    <!-- Route dropdown -->
    <div class="form-control">
      <label class="label" for="route-select">
        <span class="label-text">Select Route</span>
      </label>
      <select id="route-select" class="select select-bordered w-full max-w-xs" bind:value={selectedRoute}>
        <option value="">-- Select a route --</option>
        {#each availableRoutes as route}
          <option value={route}>{route}</option>
        {/each}
      </select>
    </div>
  </div>


  <div class="px-4 py-2">
    <!-- Trip dropdown -->
    <div class="form-control">
      <label class="label" for="trip-select">
        <span class="label-text">Select Trip</span>
      </label>
      <select
        id="trip-select"
        class="select select-bordered w-full max-w-xs"
        bind:value={selectedTrip}
        disabled={selectedRoute === '' || availableTrips.length === 0}
      >
        <option value="">-- Select a trip --</option>
        {#each availableTrips as trip}
          <option value={trip}>{trip}</option>
        {/each}
      </select>
    </div>
  </div>
</div>

<!-- for debug  -->
<!-- <div>
  <p>{selectedRoute},{selectedTrip}</p>
</div> -->

<!-- toggles and stuff go here for user control  -->
<div class = "controlpanel">
  <div class="px-4">
  <!-- og vs snapped points -->
  <Switch bind:value = {switchvalue} label= "Choose between original and snapped data" design = "multi" options = {["original", "snapped"]} fontSize = {12}/>
  </div>
  {#if switchvalue === 'snapped'}
    <div class="weight-controls">
      <h3>Snapping Parameter Weights</h3>

      <div class="slider-group">
        <label class="slider-label">
          <span>Heading Weight: {headingWeight.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={headingWeight}
            oninput={(e) => adjustWeights('heading', parseFloat(e.target.value))}
            class="slider"
          />
        </label>
      </div>

      <div class="slider-group">
        <label class="slider-label">
          <span>Neighbor Weight: {neighborWeight.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={neighborWeight}
            oninput={(e) => adjustWeights('neighbor', parseFloat(e.target.value))}
            class="slider"
          />
        </label>
      </div>

      <div class="slider-group">
        <label class="slider-label">
          <span>Road Type Weight: {roadTypePriorityWeight.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={roadTypePriorityWeight}
            oninput={(e) => adjustWeights('roadType', parseFloat(e.target.value))}
            class="slider"
          />
        </label>
      </div>

      <div class="sum-display">
        Total: {(headingWeight + neighborWeight + roadTypePriorityWeight).toFixed(2)}
      </div>

      {#if hasUnappliedChanges}
        <div class="button-group">
          <button
            class="apply-button"
            onclick={applyWeights}
          >
            Apply Weights
          </button>
          <button
            class="reset-button"
            onclick={resetWeights}
          >
            Reset
          </button>
        </div>
        <!-- <div class="unapplied-indicator">
          ⚠️ Changes not applied yet
        </div> -->
      {:else}
        <div class="applied-indicator">
          ✓ Weights applied
        </div>
      {/if}
    </div>
  {/if}

</div>

<div class="map-wrap">
  <a href="https://www.maptiler.com" class="watermark"><img
    src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo"/></a>
  <div class="map" bind:this={mapContainer}></div>

  {#if switchvalue === 'snapped'}
    <div class="map-legend">
      <h4>Point Status</h4>
      <div class="legend-item">
        <span class="legend-circle" style="background-color: #ff5a5f;"></span>
        <span>Snapped to Road</span>
      </div>
      <div class="legend-item">
        <span class="legend-circle" style="background-color: #007cbf;"></span>
        <span>Original Position</span>
      </div>
    </div>
  {/if}

  <!-- <div><p>{JSON.stringify(mapMatch, null, 2)}</p></div> -->
</div>

<style>


  .map-wrap {
    position: relative;
    width: 100%;
    height: calc(100vh - 77px);
    /* calculate height of the screen (viewport height) minus the heading */

  }

  .map {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
  }

  .weight-controls {
    margin-top: 20px;
    padding: 15px;
    background: white;
    border-radius: 8px;
  }

  .weight-controls h3 {
    margin-bottom: 15px;
    font-size: 14px;
    font-weight: 600;
  }

  .slider-group {
    margin-bottom: 15px;
  }

  .slider-label {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slider-label span {
    font-size: 13px;
    font-weight: 500;
  }

  .slider {
    width: 100%;
    max-width: 300px;
    cursor: pointer;
  }

  .sum-display {
    margin-top: 10px;
    padding: 8px;
    background: white;
    border-radius: 4px;
    font-weight: 600;
    text-align: center;
    border: 1px solid #ddd;
  }

  .map-legend {
    position: absolute;
    top: 10px;
    right: 10px;
    background: white;
    padding: 12px;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    z-index: 1000;
  }

  .map-legend h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 600;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 11px;
  }

  .legend-circle {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 0 2px rgba(0,0,0,0.3);
  }

  .button-group {
    display: flex;
    gap: 10px;
    margin-top: 15px;
  }

  .apply-button, .reset-button {
    flex: 1;
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .apply-button {
    background: #10b981;
    color: white;
  }

  .apply-button:hover {
    background: #059669;
  }

  .reset-button {
    background: #6b7280;
    color: white;
  }

  .reset-button:hover {
    background: #4b5563;
  }

  .unapplied-indicator {
    margin-top: 10px;
    padding: 6px;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fbbf24;
    border-radius: 4px;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
  }

  .applied-indicator {
    margin-top: 10px;
    padding: 6px;
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #10b981;
    border-radius: 4px;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
  }

</style>

