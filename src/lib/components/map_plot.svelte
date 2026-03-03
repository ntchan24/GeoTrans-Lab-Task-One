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

  let { routeids } = $props();//receive props from page.svelte, this is the points object from map plotter!!

  onMount(() => {
    //handle points here using turf.js 
    //create turf points for all the points 


    //test points 
    const point1 = turf.point([-113.52, 53.54], { name: 'Edmonton' });
    const point2 = turf.point([-114.07, 51.04], { name: 'Calgary' });
    
    // Add coordinate strings to properties for easy access on hover
    point1.properties.coords = `${point1.geometry.coordinates[0]}, ${point1.geometry.coordinates[1]}`;
    point2.properties.coords = `${point2.geometry.coordinates[0]}, ${point2.geometry.coordinates[1]}`;

    // Create a line connecting the points
    const line = turf.lineString([point1.geometry.coordinates, point2.geometry.coordinates], { 
      name: 'Highway 2 Route' 
    });

    // Calculate distance of the line using Turf.js
    const distance = turf.length(line, { units: 'kilometers' });
    line.properties.distance = `${distance.toFixed(2)} km`;

    // Combine into a FeatureCollection
    const geojsonData = turf.featureCollection([point1, point2, line]);





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
    });





    map.on('load', () => {
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
    })
    


  })



  //runs when the website is closed 
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
  let availableRoutes = $derived(routeids ? Object.keys(routeids) : []);

  // Get available trips for the selected route
  let availableTrips = $derived(
    selectedRoute && routeids && routeids[selectedRoute]
      ? routeids[selectedRoute].map(tripObj => Object.keys(tripObj)[0])
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

<div>
  <p>{selectedRoute},{selectedTrip}</p>
</div>


<div class="map-wrap">
  <a href="https://www.maptiler.com" class="watermark"><img
    src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo"/></a>
  <div class="map" bind:this={mapContainer}></div>


  <!-- <div><p>{JSON.stringify(routeids, null, 2)}</p></div> -->
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

