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


  onMount(() => {
    // Temporarily commenting out map initialization to fix dropdown functionality
    // Uncomment this when the map container div is also uncommented
    
    const initialState = {lat: 53.546206, lng: -113.491241, zoom: 13};

    map = new maplibregl.Map({
      container: mapContainer,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      center: [initialState.lng,initialState.lat],
      zoom: initialState.zoom
    })

  })



  //runs when the website is closed 
    onDestroy(() => {
    if (map) map.remove();
  });


  //receive props from page.svelte, this is the points object from map plotter!!
  let { routeids } = $props();


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

  $effect(()=> {
    console.log('Route changed to:', selectedRoute);
    console.log('Available trips:', availableTrips);
    if (selectedRoute){
      selectedTrip = '';
    }
  });

  //run this when any variable inside it changes
  //svelte reactive statement
</script>

<div class="dropdown-container">
  <!-- Route dropdown -->
  <div class="form-control">
    <label class="label">
      <span class="label-text">Select Route</span>
    </label>
    <select class="select select-bordered w-full max-w-xs" bind:value={selectedRoute}>
      <option value="">-- Select a route --</option>
      {#each availableRoutes as route}
        <option value={route}>{route}</option>
      {/each}
    </select>
  </div>

  <!-- Trip dropdown -->
  <div class="form-control">
    <label class="label">
      <span class="label-text">Select Trip</span>
    </label>
    <select
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




<div class="map-wrap">
  <a href="https://www.maptiler.com" class="watermark"><img
    src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo"/></a>
  <div class="map" bind:this={mapContainer}></div>


  <!-- <div><p>{JSON.stringify(routeids, null, 2)}</p></div> -->
</div>

<style>
  .dropdown-container {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background-color: #f3f4f6;
    border-radius: 0.5rem;
    margin: 0.5rem;
  }

  .map-wrap {
    position: relative;
    width: 100%;
    height: calc(100vh - 77px);
    /* calculate height of the screen (viewport height) minus the heading */
 
  }

  .map {
    position: absolute;
    width: 100%;
    height: 100%;
  }

  .watermark {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 999;
  }
</style>

