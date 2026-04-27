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
  import KDBush from 'kdbush';
  import * as geokdbush from 'geokdbush';
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

  // Region mode state
  let regionMode = $state('view'); // 'view' | 'draw'
  let currentPolygon = $state([]);
  let definedRegion = $state(null);
  let regionStats = $state({ totalPoints: 0, byRoute: {} });

  // Filter state
  let selectedRoutes = $state(['SE', 'NW', 'CENTRAL', 'RWIS_SW', 'SW']);

  // Spatial index for region queries
  let spatialIndex = null;
  let spatialPoints = [];

  // Flag to prevent race conditions
  let isUpdatingFromRegion = false;

  // Debug flag for troubleshooting
  const DEBUG_REGION = true;
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

  // Get all trip data from selected routes
  function getAllPointsFromSelectedRoutes() {
    if (!mapMatch || selectedRoutes.length === 0) {
      return [];
    }

    const allPoints = [];

    // Iterate through each selected route
    selectedRoutes.forEach(route => {
      const routeData = mapMatch[route];
      if (routeData && Array.isArray(routeData)) {
        // Iterate through each trip in the route
        routeData.forEach(tripObj => {
          const tripId = Object.keys(tripObj)[0];
          const tripPoints = tripObj[tripId];

          if (tripPoints && Array.isArray(tripPoints)) {
            // Add route and trip info to each point
            tripPoints.forEach(point => {
              allPoints.push({
                ...point,
                route: route,
                tripId: tripId
              });
            });
          }
        });
      }
    });

    if (DEBUG_REGION) {
      console.log(`Collected ${allPoints.length} points from ${selectedRoutes.length} routes`);
      const routeCounts = {};
      selectedRoutes.forEach(r => routeCounts[r] = 0);
      allPoints.forEach(p => {
        if (routeCounts[p.route] !== undefined) routeCounts[p.route]++;
      });
      console.log('Points per route:', routeCounts);
    }

    return allPoints;
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

    // If region is defined, always use all routes data
    if (definedRegion) {
      const allPointsData = getAllPointsFromSelectedRoutes();

      if (allPointsData && allPointsData.length > 0) {
        // Only build index if it doesn't exist
        if (!spatialIndex || spatialPoints.length === 0) {
          if (DEBUG_REGION) console.log('Building spatial index for all routes in updateMapData');
          buildSpatialIndex(allPointsData);
        }
        filterPointsInRegion();
      }
    } else {
      // Normal visualization of selected trip only
      const tripData = getSelectedTripData();
      // Normal visualization without region
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
  }

  // Build spatial index for efficient region queries
  function buildSpatialIndex(tripData) {
    if (!tripData || tripData.length === 0) {
      if (DEBUG_REGION) console.log('No trip data to build index');
      return;
    }

    spatialPoints = tripData.map((p, idx) => ({
      ...p,
      lon: p.coords[1],
      lat: p.coords[0],
      originalIndex: idx
    }));

    // Create index with the number of points
    spatialIndex = new KDBush(spatialPoints.length);

    // Add each point manually
    for (const point of spatialPoints) {
      spatialIndex.add(point.lon, point.lat);
    }

    // Finalize the index
    spatialIndex.finish();

    if (DEBUG_REGION) {
      console.log(`Spatial index built with ${spatialPoints.length} points`);
      if (spatialPoints.length > 0) {
        console.log('Sample point:', {
          lon: spatialPoints[0].lon,
          lat: spatialPoints[0].lat,
          snapped: spatialPoints[0].snapped
        });
      }
    }
  }

  // Handle map click for polygon drawing
  function handleMapClick(e) {
    if (regionMode === 'draw') {
      const point = [e.lngLat.lng, e.lngLat.lat];
      currentPolygon = [...currentPolygon, point];
      updatePolygonLayer();
    }
  }

  // Complete polygon and switch to view mode
  function completePolygon() {
    if (currentPolygon.length >= 3) {
      // Get all points from selected routes instead of just selected trip
      const allPointsData = getAllPointsFromSelectedRoutes();

      if (allPointsData && allPointsData.length > 0) {
        // Set flag to prevent race condition
        isUpdatingFromRegion = true;

        // Build spatial index from ALL points
        buildSpatialIndex(allPointsData);

        // Close the polygon by adding first point at the end
        definedRegion = turf.polygon([[...currentPolygon, currentPolygon[0]]]);

        console.log('Polygon completed, filtering points from all selected routes...');

        // Now filter with valid index
        filterPointsInRegion();

        regionMode = 'view';

        // Reset flag after a short delay
        setTimeout(() => {
          isUpdatingFromRegion = false;
        }, 100);
      } else {
        console.error('No data available from selected routes');
      }
    }
  }

  // Clear region and reset visualization
  function clearRegion() {
    definedRegion = null;
    currentPolygon = [];
    regionStats = { totalPoints: 0, byRoute: {} };

    // Clear polygon layers
    if (map && map.loaded()) {
      const polygonSource = map.getSource('region-polygon');
      const drawingSource = map.getSource('drawing-points');
      if (polygonSource) {
        polygonSource.setData(turf.featureCollection([]));
      }
      if (drawingSource) {
        drawingSource.setData(turf.featureCollection([]));
      }
    }

    // Reset to normal visualization
    updateMapData();
  }

  // Filter points within the defined region
  function filterPointsInRegion() {
    if (DEBUG_REGION) {
      console.log('=== filterPointsInRegion called ===');
      console.log('definedRegion:', !!definedRegion);
      console.log('spatialIndex:', !!spatialIndex);
      console.log('spatialPoints.length:', spatialPoints.length);
      console.log('selectedRoutes:', selectedRoutes);
    }

    if (!definedRegion) {
      console.log('No defined region');
      return;
    }
    if (!spatialIndex) {
      console.log('No spatial index');
      return;
    }
    if (spatialPoints.length === 0) {
      console.log('No spatial points to filter');
      return;
    }

    console.log(`Filtering ${spatialPoints.length} points from selected routes for region...`);

    // Get bounding box of region
    const bbox = turf.bbox(definedRegion);

    // Calculate center and search radius
    const centerLon = (bbox[0] + bbox[2]) / 2;
    const centerLat = (bbox[1] + bbox[3]) / 2;
    const searchRadiusKm = turf.distance(
      turf.point([bbox[0], bbox[1]]),
      turf.point([bbox[2], bbox[3]])
    );
    const searchRadiusM = searchRadiusKm * 1000; // Convert km to meters for geokdbush

    console.log(`Searching around center: [${centerLon}, ${centerLat}] with radius: ${searchRadiusKm} km`);

    // Get indices of points near the region using geokdbush
    const candidateIndices = geokdbush.around(
      spatialIndex,
      centerLon,
      centerLat,
      10000, // Get up to 10000 points
      searchRadiusM
    );

    // Map indices back to actual points
    const candidates = candidateIndices.map(idx => spatialPoints[idx]);

    console.log(`Found ${candidates.length} candidate points near region (from ${spatialPoints.length} total)`);

    // Filter candidates by exact polygon containment
    const pointsInRegion = candidates.filter(p => {
      const point = turf.point([p.lon, p.lat]);
      return turf.booleanPointInPolygon(point, definedRegion);
    });

    console.log(`${pointsInRegion.length} points inside polygon`);

    // Apply route filters (points already have route property from getAllPointsFromSelectedRoutes)
    const filteredPoints = pointsInRegion.filter(p => {
      return p.route && selectedRoutes.includes(p.route);
    });

    console.log(`${filteredPoints.length} points after route filter from routes: ${selectedRoutes.join(', ')}`);

    // Calculate statistics
    updateRegionStats(filteredPoints);

    // Update map visualization with filtered points
    updateMapWithFilteredPoints(filteredPoints);
  }

  // Update statistics for the region
  function updateRegionStats(points) {
    const stats = {
      totalPoints: points.length,
      byRoute: {}
    };

    // Initialize route counts
    selectedRoutes.forEach(route => {
      stats.byRoute[route] = 0;
    });

    // Count points by route
    points.forEach(point => {
      if (point.route && stats.byRoute[point.route] !== undefined) {
        stats.byRoute[point.route]++;
      }
    });

    if (DEBUG_REGION) {
      console.log('Region statistics:', stats);
    }

    regionStats = stats;
  }

  // Update map with filtered points
  function updateMapWithFilteredPoints(filteredPoints) {
    if (!map || !map.loaded()) return;

    console.log(`Updating map with ${filteredPoints.length} filtered points`);

    const features = [];
    const lineCoordinates = [];

    // Create point features
    filteredPoints.forEach((point, index) => {
      const coords = [point.lon, point.lat];
      lineCoordinates.push(coords);

      const pointFeature = turf.point(coords, {
        index: index,
        accuracy: point.accuracy,
        time: point.time,
        coords: `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`,
        ...(point.distancetoNext && { distanceToNext: `${point.distancetoNext.toFixed(3)} km` }),
        ...(point.speedBetweenNext && { speed: `${(point.speedBetweenNext).toFixed(1)} km/h` }),
        snapped: point.snapped || false,
        snappedRoad: point.snappedRoad ? JSON.stringify(point.snappedRoad) : null,
        inRegion: true,
        route: selectedRoute
      });

      features.push(pointFeature);
    });

    // Create line if we have at least 2 points
    if (lineCoordinates.length >= 2) {
      const lineFeature = turf.lineString(lineCoordinates, {
        name: `${selectedRoute} - ${selectedTrip} (Region Filtered)`,
        totalDistance: `${turf.length(turf.lineString(lineCoordinates), { units: 'kilometers' }).toFixed(2)} km`,
        inRegion: true
      });
      features.push(lineFeature);
    }

    const geojson = turf.featureCollection(features);

    // Update map source
    const source = map.getSource('route-data');
    if (source) {
      console.log(`Setting map data with ${geojson.features.length} features`);
      source.setData(geojson);

      // Fit map to filtered points if we have any
      if (features.length > 0) {
        const bounds = turf.bbox(geojson);
        map.fitBounds(bounds, {
          padding: 50,
          duration: 500
        });
      }
    } else {
      console.error('Could not find route-data source');
    }
  }

  // Handle route filter changes
  function handleRouteFilterChange() {
    if (definedRegion) {
      if (DEBUG_REGION) console.log('Route filter changed, rebuilding index and re-filtering');

      // Get new set of points from newly selected routes
      const allPointsData = getAllPointsFromSelectedRoutes();

      if (allPointsData && allPointsData.length > 0) {
        // Rebuild index with new route selection
        buildSpatialIndex(allPointsData);

        // Re-filter points
        filterPointsInRegion();
      } else {
        console.log('No points available from selected routes');
        // Clear the map if no routes selected
        const source = map.getSource('route-data');
        if (source) {
          source.setData(turf.featureCollection([]));
        }
        updateRegionStats([]);
      }
    }
  }

  // Update polygon visualization layers
  function updatePolygonLayer() {
    if (!map || !map.loaded()) return;

    // Update drawing points
    const points = currentPolygon.map(coord => turf.point(coord));
    const drawingSource = map.getSource('drawing-points');
    if (drawingSource) {
      drawingSource.setData(turf.featureCollection(points));
    }

    // Update polygon preview if we have at least 3 points
    if (currentPolygon.length >= 3) {
      const polygon = turf.polygon([[...currentPolygon, currentPolygon[0]]]);
      const polygonSource = map.getSource('region-polygon');
      if (polygonSource) {
        polygonSource.setData(turf.featureCollection([polygon]));
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

      // Add polygon drawing source
      map.addSource('region-polygon', {
        type: 'geojson',
        data: turf.featureCollection([])
      });

      // Add drawing points source
      map.addSource('drawing-points', {
        type: 'geojson',
        data: turf.featureCollection([])
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

    // Add Points Layer with conditional styling for snapped points and region filtering
    map.addLayer({
      id: 'route-points',
      type: 'circle',
      source: 'route-data',
      filter:['==', '$type', 'Point'], // Only style the points
      paint: {
        'circle-radius': 8,
        'circle-color': [
          'case',
          ['get', 'inRegion'],
          [
            'match',
            ['get', 'route'],
            'SE', '#ff5a5f',
            'NW', '#007cbf',
            'CENTRAL', '#00a86b',
            'RWIS_SW', '#ff8c00',
            'SW', '#9370db',
            '#999' // default
          ],
          // Original color scheme for non-region points
          [
            'case',
            ['get', 'snapped'],
            '#ff5a5f',  // Red for snapped points
            '#007cbf'   // Blue for unsnapped points
          ]
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

    // Add region polygon fill layer
    map.addLayer({
      id: 'region-fill',
      type: 'fill',
      source: 'region-polygon',
      paint: {
        'fill-color': '#088',
        'fill-opacity': 0.2
      }
    });

    // Add region polygon outline layer
    map.addLayer({
      id: 'region-outline',
      type: 'line',
      source: 'region-polygon',
      paint: {
        'line-color': '#088',
        'line-width': 3,
        'line-dasharray': [2, 1]
      }
    });

    // Add drawing points layer
    map.addLayer({
      id: 'drawing-points',
      type: 'circle',
      source: 'drawing-points',
      paint: {
        'circle-radius': 5,
        'circle-color': '#088',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
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

      // Add click handler for polygon drawing
      map.on('click', handleMapClick);

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
    if (selectedTrip && !isUpdatingFromRegion) {
      console.log('Updating map for trip:', selectedTrip);
      updateMapData();
    } else if (!selectedTrip && map && map.loaded()) {
      // Clear map when no trip is selected
      const source = map.getSource('route-data');
      if (source) {
        source.setData(turf.featureCollection([]));
      }
    }
  });

  // Removed duplicate effect that was causing race condition
  // Filtering is now handled by updateMapData() and explicit calls

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
        <!-- <div class="applied-indicator">
          ✓ Weights applied
        </div> -->
      {/if}
    </div>
  {/if}

  <!-- Region Mode Controls -->
  {#if switchvalue === 'snapped'}
    <div class="region-controls">
      <h3>Region Selection</h3>

      <div class="mode-toggle">
        <button
          class="btn btn-sm {regionMode === 'draw' ? 'btn-primary' : 'btn-outline'}"
          onclick={() => regionMode = 'draw'}
          disabled={regionMode === 'draw' || !selectedTrip}>
          Draw Region
        </button>
        <button
          class="btn btn-sm btn-success"
          onclick={completePolygon}
          disabled={currentPolygon.length < 3}>
          Complete ({currentPolygon.length} pts)
        </button>
        <button
          class="btn btn-sm btn-error"
          onclick={clearRegion}
          disabled={!definedRegion}>
          Clear Region
        </button>
      </div>

      <!-- Route Filters -->
      <div class="filter-panel">
        <h4>Filter by Routes</h4>
        <div class="form-control">
          {#each ['SE', 'NW', 'CENTRAL', 'RWIS_SW', 'SW'] as route}
            <label class="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                class="checkbox checkbox-xs"
                bind:group={selectedRoutes}
                value={route}
                onchange={() => handleRouteFilterChange()}
                checked={selectedRoutes.includes(route)}>
              <span class="label-text text-sm">{route}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Statistics Panel -->
      {#if definedRegion && regionStats.totalPoints > 0}
        <div class="stats-panel">
          <h4 class="font-bold text-sm mb-2">Region Statistics</h4>
          <div class="stat-item">
            <span>Total Points:</span>
            <span class="font-mono">{regionStats.totalPoints}</span>
          </div>

          {#if Object.keys(regionStats.byRoute).length > 0}
            <div class="mt-2">
              <h5 class="font-semibold text-xs">Points by Route:</h5>
              {#each Object.entries(regionStats.byRoute) as [route, count]}
                {#if count > 0}
                  <div class="stat-item">
                    <span class="text-xs">{route}:</span>
                    <span class="font-mono text-xs">{count}</span>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
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
      {#if regionMode === 'draw'}
        <div class="legend-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
          <span style="color: #088; font-weight: bold;">Drawing Mode Active</span>
        </div>
        <div class="legend-item">
          <span style="font-size: 10px;">Click to add points</span>
        </div>
      {/if}
      {#if definedRegion}
        <div class="legend-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
          <span style="color: #088; font-weight: bold;">Region Defined</span>
        </div>
      {/if}
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

  .region-controls {
    margin-top: 20px;
    padding: 15px;
    background: white;
    border-radius: 8px;
    max-width: 300px;
  }

  .region-controls h3 {
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
  }

  .mode-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .filter-panel {
    border-top: 1px solid #e5e7eb;
    padding-top: 12px;
    margin-top: 12px;
  }

  .filter-panel h4 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .stats-panel {
    margin-top: 12px;
    padding: 12px;
    background: #f3f4f6;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }

</style>

