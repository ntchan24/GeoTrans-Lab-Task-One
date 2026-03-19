<!-- clone of map_plot, for map snapping  -->

<!-- dropdown for the different trips, render based on the trip -->
<!-- map with lines and points  -->
<script>
  
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import * as turf from '@turf/turf';

  const MAPTILER_KEY =  "UHv14Wh0RtdXjkmopUTK";

  let map;
  let mapContainer;

  let { mapMatch } = $props();//receive props from page.svelte, this is the map matched data


  // Function to get the selected trip data
  function getSelectedTripData() {
    //all the return nulls are checks to not return bad data 
    if (!selectedRoute || !selectedTrip || !mapMatch) return null;

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
      // convert coordinates [lat, lng] to [lng, lat] for GeoJSON
      const coords = [point.coords[1], point.coords[0]];
      lineCoordinates.push(coords);

      
      const pointFeature = turf.point(coords, {
        index: index,
        accuracy: point.accuracy,
        time: point.time,
        coords: `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`,
        ...(point.distancetoNext && { distanceToNext: `${point.distancetoNext.toFixed(3)} km` }),
        ...(point.speedBetweenNext && { speed: `${(point.speedBetweenNext).toFixed(1)} km/h` })
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

    // Add Points Layer
    map.addLayer({
      id: 'route-points',
      type: 'circle',
      source: 'route-data',
      filter:['==', '$type', 'Point'], // Only style the points
      paint: {
        'circle-radius': 8,
        'circle-color': '#007cbf',
        'circle-stroke-width': 2,
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
        const { index, coords, accuracy, time, distanceToNext, speed } = e.features[0].properties;
        const coordinates = e.features[0].geometry.coordinates.slice();

        const htmlContent = `
          <div style="color: black;">
            <strong>Point ${index}</strong><br>
            Coordinates: ${coords}<br>
            Accuracy: ${accuracy?.toFixed(2) || 'N/A'} m<br>
            Time: ${time ? new Date(time).toLocaleString() : 'N/A'}
            ${distanceToNext ? `<br>Distance to next: ${distanceToNext}` : ''}
            ${speed ? `<br>Speed: ${speed}` : ''}
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

  let selectedRoute = $state('');
  let selectedTrip = $state('');

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
  //run this when any variable inside it changes
    //svelte reactive statement
  $effect(()=> {
    console.log('Route changed to:', selectedRoute);
    console.log('Available trips:', availableTrips);
    if (selectedRoute){
      selectedTrip = '';
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

<div>
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

<!-- <div>
  <p>{selectedRoute},{selectedTrip}</p>
</div> -->


<div class="map-wrap">
  <!-- <a href="https://www.maptiler.com" class="watermark"><img
    src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo"/></a>
  <div class="map" bind:this={mapContainer}></div> -->


  <div><p>{JSON.stringify(mapMatch, null, 2)}</p></div>
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




</style>

