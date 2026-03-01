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
  let points = $props();






</script>


<div class="map-wrap">
  <a href="https://www.maptiler.com" class="watermark"><img
    src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo"/></a>
  <div class="map" bind:this={mapContainer}></div>


  <!-- <div><p>{JSON.stringify(points, null, 2)}</p></div> -->
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    height: calc(100vh - 77px); /* calculate height of the screen minus the heading */
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

<!-- 
<div bind:this={mapContainer} class="map-container"></div> 

<style>
  @import 'maplibre-gl/dist/maplibre-gl.css';

  .map-container {
    width: 100%;
    height: 100vh;
  }

  /* Style the popup */
  :global(.maplibregl-popup-content) {
    padding: 10px 14px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
  }
</style> -->