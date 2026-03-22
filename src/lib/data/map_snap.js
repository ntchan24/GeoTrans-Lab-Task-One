//here is where we handle the points snapping to road ground truth 

/*
general flow of the program:
*/
 
import data from '../coe-snic-default-rtdb-logs-export.json' with { type: "json" }
import * as Plotter from './map_plotter.js';
import { normalizeEntries, distanceInKmBetweenEarthCoordinates, extractLogIds } from './processing_script.js'
import KDBush from 'kdbush';
import * as geokdbush from 'geokdbush';
import * as turf from '@turf/turf';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File path for cached road data
const ROAD_DATA_FILE = path.join(__dirname, 'edmonton-roads.json');

// Save road data to JSON file
async function saveRoadDataToFile(data, filename = ROAD_DATA_FILE) {
    try {
        const dataToSave = {
            metadata: {
                fetchDate: new Date().toISOString(),
                totalRoads: data.elements ? data.elements.length : 0,
                version: '1.0',
                generator: data.generator || 'overpass-api'
            },
            data: data
        };

        await fs.writeFile(filename, JSON.stringify(dataToSave, null, 2), 'utf-8');
        console.log(`Road data saved to ${filename} (${dataToSave.metadata.totalRoads} roads)`);
        return true;
    } catch (error) {
        console.error('Failed to save road data to file:', error);
        return false;
    }
}

// Load road data from JSON file
async function loadRoadDataFromFile(filename = ROAD_DATA_FILE) {
    try {
        const fileContent = await fs.readFile(filename, 'utf-8');
        const savedData = JSON.parse(fileContent);

        console.log(`Loaded road data from ${filename}`);
        console.log(`  Fetch date: ${savedData.metadata.fetchDate}`);
        console.log(`  Total roads: ${savedData.metadata.totalRoads}`);

        return savedData.data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No cached road data file found');
        } else {
            console.error('Failed to load road data from file:', error);
        }
        return null;
    }
}

// Check if cached file exists and is recent
async function isCachedDataValid(filename = ROAD_DATA_FILE, maxAgeHours = 24 * 7) { // Default: 1 week
    try {
        const stats = await fs.stat(filename);
        const fileAge = Date.now() - stats.mtime.getTime();
        const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert hours to milliseconds

        if (fileAge < maxAge) {
            console.log(`Cached data is ${(fileAge / 1000 / 60 / 60).toFixed(1)} hours old (valid)`);
            return true;
        } else {
            console.log(`Cached data is ${(fileAge / 1000 / 60 / 60).toFixed(1)} hours old (expired)`);
            return false;
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No cached data file exists');
        }
        return false;
    }
}




//fetch the road map data from overpass api 
//there is a rate limit, so we don't need to fetch every time 

async function fetchOverpass(bbox=[53.50, -113.60, 53.61, -113.47], retries = 3){
    // Expanded bbox to cover all your GPS points
    // Original was too small: [53.52, -113.53, 53.55, -113.49]

    // Expanded filter to include parking areas and minor roads
    // Added: living_street, track, pedestrian (for plazas), parking_aisle (for parking lots)
    // Also added footway and cycleway where vehicles might travel
    const query = `
    [out:json][timeout:90];
    (
        way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|track|pedestrian|parking_aisle|footway|cycleway)$"](${bbox.join(",")});
        way["amenity"="parking"](${bbox.join(",")});
        way["service"~"^(parking_aisle|driveway)$"](${bbox.join(",")});
    );
    out geom;
    `;

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt < retries; attempt++) {
        try{
            const response = await fetch("https://overpass-api.de/api/interpreter", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `data=${encodeURIComponent(query)}`
            });

            // Check if response is OK
            if (!response.ok) {
                const text = await response.text();
                console.error(`Overpass API error (${response.status}):`, text);

                // If it's a rate limit (429) or server error (5xx), retry with backoff
                if ((response.status === 429 || response.status >= 500) && attempt < retries - 1) {
                    const baseWait = response.status === 429 ? 5000 : 1000; // Longer wait for rate limits
                    const waitTime = Math.pow(2, attempt) * baseWait; // Exponential backoff
                    console.log(`${response.status === 429 ? 'Rate limited' : 'Server error'}, retrying in ${waitTime/1000}s... (attempt ${attempt + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }

                throw new Error(`Overpass API returned status ${response.status}`);
            }

            // Check content type
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("Overpass API returned non-JSON response:", text);
                throw new Error("Overpass API did not return JSON");
            }

            const data = await response.json();
            return data
        } catch (error){
            if (attempt === retries - 1) {
                console.error("overpass api request failed after all retries : ",error)
                throw error; // Re-throw after all retries exhausted
            }

            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`Error on attempt ${attempt + 1}, retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

}


// Divide a large bounding box into smaller chunks
function divideBoundingBox(bbox, chunkSizeKm = 5) {
    const [minLat, minLon, maxLat, maxLon] = bbox;

    // Convert km to approximate degrees (1 degree ≈ 111km for latitude, ≈ 85km for longitude at this latitude)
    const latChunkSize = chunkSizeKm / 111;
    const lonChunkSize = chunkSizeKm / 85;

    const chunks = [];

    for (let lat = minLat; lat < maxLat; lat += latChunkSize) {
        for (let lon = minLon; lon < maxLon; lon += lonChunkSize) {
            chunks.push([
                lat,
                lon,
                Math.min(lat + latChunkSize, maxLat),
                Math.min(lon + lonChunkSize, maxLon)
            ]);
        }
    }

    return chunks;
}

// Fetch roads from all chunks and combine results
async function fetchAllRoads(bbox) {
    const chunks = divideBoundingBox(bbox, 10); // Use larger 10km x 10km chunks to reduce API calls
    console.log(`Fetching roads in ${chunks.length} chunks...`);

    const allElements = [];
    const failedChunks = [];

    // Process chunks with a small delay to avoid overwhelming the API
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processing chunk ${i + 1}/${chunks.length}: [${chunk.map(c => c.toFixed(3)).join(', ')}]`);

        try {
            const data = await fetchOverpass(chunk, 2); // Fewer retries per chunk
            if (data && data.elements) {
                allElements.push(...data.elements);
                console.log(`  ✓ Found ${data.elements.length} roads`);
            }
        } catch (error) {
            console.error(`  ✗ Failed to fetch chunk ${i + 1}:`, error.message);
            failedChunks.push(chunk);
        }

        // Longer delay between chunks to avoid rate limiting
        // Increase delay if we're getting rate limited
        if (i < chunks.length - 1) {
            const delayMs = failedChunks.length > 2 ? 3000 : 2000; // Longer delay if we're having issues
            console.log(`  Waiting ${delayMs/1000}s before next chunk...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    if (failedChunks.length > 0) {
        console.warn(`Failed to fetch ${failedChunks.length} chunks. Continuing with partial data.`);
    }

    // Remove duplicates (roads that appear in multiple chunks)
    const uniqueElements = [];
    const seenIds = new Set();

    for (const element of allElements) {
        if (!seenIds.has(element.id)) {
            seenIds.add(element.id);
            uniqueElements.push(element);
        }
    }

    console.log(`Total unique roads fetched: ${uniqueElements.length}`);

    return {
        elements: uniqueElements,
        timestamp: new Date().toISOString(),
        generator: "map_snap_chunked"
    };
}

const cache = new Map();
//Calculate bounding box from GPS points
//dynamic bounding box 
function calculateBoundingBox(data) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const logId of Object.keys(data)) {
        if (data[logId] && data[logId].entries) {
            const entries = normalizeEntries(data[logId].entries);
            for (const entry of entries) {
                if (entry && entry.gps) {
                    const lat = entry.gps.latitude;
                    const lon = entry.gps.longitude;
                    if (lat && lon) {
                        minLat = Math.min(minLat, lat);
                        maxLat = Math.max(maxLat, lat);
                        minLon = Math.min(minLon, lon);
                        maxLon = Math.max(maxLon, lon);
                    }
                }
            }
        }
    }

    // Add 0.01 degree buffer (approximately 1km)
    const buffer = 0.01;
    return [
        minLat - buffer,
        minLon - buffer,
        maxLat + buffer,
        maxLon + buffer
    ];
}

//we can cache it
async function getRoadMapData(key = 0, bbox = null ){
    // Check if we should force a refresh from API
    const forceRefresh = process.env.FORCE_ROAD_REFRESH === 'true';

    // First, try to load from file if not forcing refresh
    if (!forceRefresh) {
        // Check if cached data file exists and is valid
        const isValid = await isCachedDataValid();

        if (isValid) {
            const fileData = await loadRoadDataFromFile();
            if (fileData) {
                cache.set(key, fileData); // Also cache in memory
                return fileData;
            }
        }
    }

    // Check memory cache
    if (cache.has(key) && !forceRefresh){
        const value = cache.get(key)
        console.log("Using in-memory cached road data");
        return value
    }

    // If no valid cache, fetch from API
    console.log("Fetching fresh road data from Overpass API...");
    try {
        let fetchdata;

        // Use chunked fetching for large bounding boxes
        const latRange = bbox[2] - bbox[0];
        const lonRange = bbox[3] - bbox[1];

        // If the area is larger than ~10km x 10km, use chunked fetching
        if (latRange > 0.09 || lonRange > 0.12) {
            console.log("Large area detected, using chunked fetching...");
            fetchdata = await fetchAllRoads(bbox);
        } else {
            // Small area, fetch in one request
            console.log("Small area, fetching in single request...");
            fetchdata = await fetchOverpass(bbox);
        }

        // Save to file for future use
        await saveRoadDataToFile(fetchdata);

        // Cache in memory
        cache.set(key, fetchdata);
        return fetchdata;

    } catch (error) {
        console.error("Failed to fetch road data from API:", error);

        // Try to fall back to file cache even if expired
        console.log("Attempting to use expired cache as fallback...");
        const fileData = await loadRoadDataFromFile();
        if (fileData) {
            console.log("Using expired cache data as fallback");
            cache.set(key, fileData);
            return fileData;
        }

        // Last resort: return empty data
        console.error("No data available, returning empty dataset");
        return {
            elements: [],
            timestamp: new Date().toISOString(),
            generator: "map_snap_error"
        };
    }
}



function returnPoints(data,tolerance = 10){
    //identifies the points with gps accuracy more than the tolerance
    console.log(`=== FINDING BAD POINTS (accuracy > ${tolerance}m) ===`);
    // Get the processed data with proper index and structure
    const processedData = Plotter.lineDistancesSpeed(data)
    const processedRoutes = {}
    let totalPointsChecked = 0;
    let totalBadPoints = 0;

    for (const route of Object.keys(processedData)){
        processedRoutes[route] = []

        // Iterate through each trip in this route
        for (const tripData of processedData[route]){
            const logid = Object.keys(tripData)[0]
            const points = tripData[logid]

            const tripPoints = []
            for (const point of points){
                // Check if point has required data
                if (point && point.accuracy !== undefined && point.coords){
                    totalPointsChecked++;

                    //store the point only if its deemed an inaccurate point
                    if (point.accuracy > tolerance){
                        // Create turf point from coords [lat, lon] -> [lon, lat]
                        const turfPoint = turf.point([point.coords[1], point.coords[0]])

                        const pointObject = {
                            index: point.index,
                            accuracy: point.accuracy,
                            coords: point.coords, // Already in [lat, lon] format
                            turfpoint: turfPoint
                        }

                        tripPoints.push(pointObject)
                        totalBadPoints++;
                    }
                }
            }

            // Store the trip with its points with its log ID
            if (tripPoints.length > 0){
                processedRoutes[route].push({
                    [logid]:tripPoints
                })
            }
        }
    }
    console.log(`Total points checked: ${totalPointsChecked}`);
    console.log(`Bad points found (accuracy > ${tolerance}m): ${totalBadPoints}`);
    console.log(`Percentage of bad points: ${totalPointsChecked > 0 ? ((totalBadPoints / totalPointsChecked) * 100).toFixed(1) : 0}%`);

    return processedRoutes
}


function buildSpatialIndex(elements){

    //flatten all geometry points into one array
    const points = []

    elements.forEach((way,wayIndex)=>{
        if (!way.geometry) {
            console.log(`Warning: Way ${way.id} has no geometry`);
            return; // Skip ways without geometry
        }

        way.geometry.forEach((coord,coordIndex) =>{
            points.push({
                lon: coord.lon,
                lat: coord.lat,
                wayIndex,
                coordIndex
            })
        })
    })

    console.log(`Building spatial index with ${points.length} points from ${elements.length} ways`);

    //we need to build a spatial index
    //data structure that knows where things are spatially, relative to each other
    const index = new KDBush(points.length)
    for (const pt of points){
        index.add(pt.lon,pt.lat)
    }
    index.finish()

    return {index, points}


}
    

function findCloseRoads(gpsPoint, index, points, elements, maxPointsReturned, maxDistKM = 0.05, useProgressiveSearch = true){
    //geokdbush.around returns the indices into the kdbush index of points within maxdistkm of the gps point

    //50 meter radius for snapping
    let nearbyIndices = geokdbush.around(
        index,
        gpsPoint.lon,
        gpsPoint.lat,
        maxPointsReturned,
        maxDistKM
    )

    // Progressive search: if no roads found and enabled, try larger radii
    if (useProgressiveSearch && nearbyIndices.length === 0) {
        const searchRadii = [0.1, 0.2, 0.3, 0.5]; // 100m, 200m, 300m, 500m
        for (const radius of searchRadii) {
            if (radius <= maxDistKM) continue; // Skip if we already searched this radius

            nearbyIndices = geokdbush.around(
                index,
                gpsPoint.lon,
                gpsPoint.lat,
                Math.min(maxPointsReturned * 2, 200), // Increase max points for larger radius
                radius
            );

            if (nearbyIndices.length > 0) {
                console.log(`  Found roads at expanded radius: ${radius * 1000}m`);
                break;
            }
        }
    }

    //map each index back to the point object then to its parent way

    const seenWays = new Set();
    const nearbyRoads = [];

    //we only want one point from each road.
    //ie if there are 10 points all within the radius
    //we track seen roads using the set
    for (const i of nearbyIndices) {
        const pt = points[i];
        if (!seenWays.has(pt.wayIndex)) {
            seenWays.add(pt.wayIndex);
            const road = elements[pt.wayIndex];

            // Calculate distance to this specific point
            const distance = distanceInKmBetweenEarthCoordinates(
                gpsPoint.lat,
                gpsPoint.lon,
                pt.lat,
                pt.lon
            );

            //turn the geometry object into real turf.linestring

            const line = turf.lineString(road.geometry.map(pt => [pt.lon, pt.lat]));


            // Create road info object with ID and metadata
            nearbyRoads.push({
                id: road.id,
                type: road.type,
                tags: road.tags || {},
                name: road.tags?.name || 'Unnamed',
                highway: road.tags?.highway || 'unknown',
                distance: distance * 1000, // Convert to meters
                wayIndex: pt.wayIndex,
                geometry : road.geometry,
                lineString : line
            });
        }
    }

    // Sort by distance (closest first)
    nearbyRoads.sort((a, b) => a.distance - b.distance);

    return nearbyRoads;

}




async function MatchRoadsBadpoints(tolerance = 10){
    //main function
    // Calculate bbox from actual GPS data
    const bbox = calculateBoundingBox(data);
    console.log("Calculated bbox:", bbox);

    const roadMapData = await getRoadMapData(0, bbox);
    console.log("Fetched roads:", roadMapData.elements ? roadMapData.elements.length : 0)

    // Check if we have road data
    if (!roadMapData.elements || roadMapData.elements.length === 0) {
        console.error("No road data available. Check your internet connection or try again later.");
        return {}; // Return empty results
    }

    const {index,points} = buildSpatialIndex(roadMapData.elements)
    console.log(`Spatial index built with ${points.length} road points`);

    const badpoints = returnPoints(data, tolerance)

    // Process each route and its bad points
    const snappedResults = {}
    let totalPointsProcessed = 0;
    let pointsWithRoads = 0;

    for (const route of Object.keys(badpoints)) {
        snappedResults[route] = []

        for (const tripData of badpoints[route]) {
            const logId = Object.keys(tripData)[0]
            const tripPoints = tripData[logId]
            const snappedTrip = []

            for (const point of tripPoints) {
                totalPointsProcessed++;
                const gpsPoint = {
                    lon: point.coords[1],
                    lat: point.coords[0]
                }

                // Dynamic search radius based on GPS accuracy
                // For accurate GPS (< 20m): use 50m radius
                // For moderate GPS (20-50m): use 100m radius
                // For poor GPS (> 50m): use up to 200m radius
                const gpsAccuracy = point.accuracy || 20; // Default to 20m if not specified
                let searchRadiusKm;
                let maxPointsToReturn;

                if (gpsAccuracy < 20) {
                    searchRadiusKm = 0.05; // 50m for accurate GPS
                    maxPointsToReturn = 30; // Enough for complex intersections
                } else if (gpsAccuracy < 50) {
                    searchRadiusKm = 0.1;  // 100m for moderate accuracy
                    maxPointsToReturn = 50; // More points for larger radius
                } else {
                    // For poor accuracy, use 1.5x the accuracy, max 200m
                    searchRadiusKm = Math.min(0.2, gpsAccuracy * 1.5 / 1000);
                    maxPointsToReturn = 100; // Many points for largest radius
                }

                const nearbyRoads = findCloseRoads(
                    gpsPoint,
                    index,
                    points,
                    roadMapData.elements,
                    maxPointsToReturn,  // Dynamic based on search radius
                    searchRadiusKm,
                    true  // Enable progressive search for bad points
                )

                if (nearbyRoads.length > 0) {
                    pointsWithRoads++;
                }

                snappedTrip.push({
                    original: point,
                    nearbyRoadsCount: nearbyRoads.length,
                    nearbyRoads: nearbyRoads // Include full road information
                })
            }

            if (snappedTrip.length > 0) {
                snappedResults[route].push({
                    [logId]: snappedTrip
                })
            }
        }
    }

    console.log(JSON.stringify(snappedResults, null, 2))
    return snappedResults;
    //this returns the closest roads for every inaccurate point 
}




async function findHeadAndTail(badpoints, tolerance = 10){
    //head and tail nodes are the last accurate entries to either side, ie before and after the inaccurate point
    //for each inaccurate point i need to find the indexes of the head and tail
    //we need to find out which roads the head and tail are on
    const originalArray = Plotter.lineDistancesSpeed(data)

    // const badpoints = returnPoints(data)
    //this object has the index of the bad points, so we can cross reference them in the originalArray

    // Fetch road data first
    const bbox = calculateBoundingBox(data);
    const roadMapData = await getRoadMapData(0, bbox);

    if (!roadMapData.elements || roadMapData.elements.length === 0) {
        console.error("No road data available for head/tail matching");
        return badpoints;
    }

    //for loop to go through each route, then each trip
    const {index: spatialIndex, points: spatialPoints} = buildSpatialIndex(roadMapData.elements)

    for (const route of Object.keys(badpoints)){

        for (const trip of badpoints[route]){
            const logId = Object.keys(trip)[0]
            const points = trip[logId]
            
            //for all the points 
            for (let i = 0; i<points.length;i++){
                
                
                const badpoint = points[i]

                //find their originals in the original Array

                //Find the matching trip in originalArray
                let originalPoints = null;
                for (const originalTrip of originalArray[route]) {
                    if (originalTrip[logId]) {
                        originalPoints = originalTrip[logId];
                        break;
                    }
                }

                for (const originalPoint of originalPoints){
                    if (badpoint.index ===originalPoint.index){
                        //we know we found the point in the original array 
                        //iterate on both sides until we find the head and tail 
                        
                        const point_position = originalPoints.indexOf(originalPoint)

                        //find head (searching backwards)
                        let offset_point_head = null;
                        let head_offset = -1; // Start at -1 to go backwards
                        let best_head_candidate = null;
                        let best_head_accuracy = Infinity;

                        // Search up to 10 points back for the best head
                        while ((point_position + head_offset) >= 0 && head_offset >= -10) {
                            let candidate = originalPoints[point_position + head_offset];
                            if (candidate && candidate.accuracy !== undefined) {
                                // If we find a good point (accuracy < tolerance), use it immediately
                                if (candidate.accuracy < tolerance) {
                                    offset_point_head = candidate;
                                    break;
                                }
                                // Otherwise, keep track of the best candidate so far
                                if (candidate.accuracy < best_head_accuracy) {
                                    best_head_candidate = candidate;
                                    best_head_accuracy = candidate.accuracy;
                                }
                            }
                            head_offset--; // Keep going backwards
                        }

                        // If no good point found, use the best available (if accuracy < 20m)
                        if (!offset_point_head && best_head_candidate && best_head_accuracy < 20) {
                            offset_point_head = best_head_candidate;
                        }

                        //find tail (searching forwards)
                        let offset_point_tail = null;
                        let tail_offset = 1; // Start at +1 to go forwards
                        let best_tail_candidate = null;
                        let best_tail_accuracy = Infinity;

                        // Search up to 10 points forward for the best tail
                        while ((point_position + tail_offset) < originalPoints.length && tail_offset <= 10) {
                            let candidate = originalPoints[point_position + tail_offset];
                            if (candidate && candidate.accuracy !== undefined) {
                                // If we find a good point (accuracy < tolerance), use it immediately
                                if (candidate.accuracy < tolerance) {
                                    offset_point_tail = candidate;
                                    break;
                                }
                                // Otherwise, keep track of the best candidate so far
                                if (candidate.accuracy < best_tail_accuracy) {
                                    best_tail_candidate = candidate;
                                    best_tail_accuracy = candidate.accuracy;
                                }
                            }
                            tail_offset++; // Keep going forwards
                        }

                        // If no good point found, use the best available (if accuracy < 20m)
                        if (!offset_point_tail && best_tail_candidate && best_tail_accuracy < 20) {
                            offset_point_tail = best_tail_candidate;
                        }
                        
                        
                        //we need to find out where the head and tail points are (roads)

                        // Check if we found valid head and tail points
                        if (!offset_point_head || !offset_point_tail) {
                            console.log(`Could not find head or tail for bad point at index ${badpoint.index}`);
                            badpoint.headStreets = [];
                            badpoint.tailStreets = [];
                            continue; // Skip to next bad point
                        }

                        // offset_point_head roads
                        const gpsPoint_head = {
                            lon: offset_point_head.coords[1],  // longitude
                            lat: offset_point_head.coords[0]   // latitude
                        }

                        const gpsAccuracyHead = offset_point_head.accuracy || 20; // Default to 20m if not specified
                        let searchRadiusKmHead;
                        let maxPointsToReturnHead;

                        if (gpsAccuracyHead < 20) {
                            searchRadiusKmHead = 0.05; // 50m for accurate GPS
                            maxPointsToReturnHead = 30; // Enough for complex intersections
                        } else if (gpsAccuracyHead < 50) {
                            searchRadiusKmHead = 0.1;  // 100m for moderate accuracy
                            maxPointsToReturnHead = 50; // More points for larger radius
                        } else {
                            // For poor accuracy, use 1.5x the accuracy, max 200m
                            searchRadiusKmHead = Math.min(0.2, gpsAccuracyHead * 1.5 / 1000);
                            maxPointsToReturnHead = 100; // Many points for largest radius
                        }

                        const nearbyRoads_head = findCloseRoads(
                            gpsPoint_head,
                            spatialIndex,
                            spatialPoints,
                            roadMapData.elements,
                            maxPointsToReturnHead,  // Dynamic based on search radius
                            searchRadiusKmHead,
                            true  // Enable progressive search
                        )
                        // offset_point_tail roads

                        const gpsPoint_tail = {
                            lon: offset_point_tail.coords[1],  // longitude
                            lat: offset_point_tail.coords[0]   // latitude
                        }

                        const gpsAccuracyTail = offset_point_tail.accuracy || 20; // Default to 20m if not specified
                        let searchRadiusKmTail;
                        let maxPointsToReturnTail;

                        if (gpsAccuracyTail < 20) {
                            searchRadiusKmTail = 0.05; // 50m for accurate GPS
                            maxPointsToReturnTail = 30; // Enough for complex intersections
                        } else if (gpsAccuracyTail < 50) {
                            searchRadiusKmTail = 0.1;  // 100m for moderate accuracy
                            maxPointsToReturnTail = 50; // More points for larger radius
                        } else {
                            // For poor accuracy, use 1.5x the accuracy, max 200m
                            searchRadiusKmTail = Math.min(0.2, gpsAccuracyTail * 1.5 / 1000);
                            maxPointsToReturnTail = 100; // Many points for largest radius
                        }

                        const nearbyRoads_tail = findCloseRoads(
                            gpsPoint_tail,
                            spatialIndex,
                            spatialPoints,
                            roadMapData.elements,
                            maxPointsToReturnTail,  // Dynamic based on search radius
                            searchRadiusKmTail,
                            true  // Enable progressive search
                        )

                        //then we need to write it back to the array of bad points 
                        //ie head location: x street, tail location : y avenue 
                        badpoint.headStreets = nearbyRoads_head
                        badpoint.tailStreets = nearbyRoads_tail

                        //we also need the coords of the head and tail as turf points
                        badpoint.headNode = turf.point([offset_point_head.coords[1], offset_point_head.coords[0]])  // [lon, lat]
                        badpoint.tailNode = turf.point([offset_point_tail.coords[1], offset_point_tail.coords[0]])  // [lon, lat]
                    }
                } 
            }
        }
    }

    return badpoints
}


async function snapToRoad(distanceWeight = 0.50, headingWeight = 0.25, neighborWeight=0.25, exponentialDecayFactor = 15, tolerance = 10){
    console.log('=== SNAP TO ROAD STARTING ===');

    //get the nearest road for every bad point
    //*this is how we know where to snap to
    const badpointsmatchedroads = await MatchRoadsBadpoints(tolerance);

    const headandtailincluded = await findHeadAndTail(badpointsmatchedroads, tolerance)

    // Count total bad points
    let totalBadPoints = 0;
    for (const route of Object.keys(headandtailincluded)) {
        for (const tripData of headandtailincluded[route]) {
            const logid = Object.keys(tripData)[0];
            totalBadPoints += tripData[logid].length;
        }
    }
    console.log(`Total bad points found: ${totalBadPoints}`);
    console.log(`Routes to process: ${Object.keys(headandtailincluded).length}`);

    const originalArray = Plotter.lineDistancesSpeed(data)

    const routeids = Plotter.getRouteIds(data)

    // Track statistics
    let pointsModified = 0;
    let pointsSkippedNoRoads = 0;
    let pointsSkippedNoScores = 0;
    let totalDistanceMoved = 0;
    let pointsInterpolated = 0;
    let pointsExpandedSearch = 0;
    const failedPoints = []; // Track failed points for analysis

    // Iterate through the bad points structure
    for (const route of Object.keys(headandtailincluded)){
        for (const tripData of headandtailincluded[route]){
            const logid = Object.keys(tripData)[0]
            const entries = tripData[logid]

            for (const entry of entries){
                //get the head and tail roads
                //* we have to make a big assumption here:
                // since these are accurate points, we can take the closest road as the road the point is on
                //at this point we have the array of bad points plus the head and tail roads
                //all sorted by distance, closest first
                //we need to get the geojson line segments for the right roads from each road object

                //should roads from the head, tail and close to the badpoint all be candidates?

                // Handle points with no nearby roads
                if (!entry.nearbyRoads || entry.nearbyRoads.length === 0) {
                    // console.log(`No nearby roads found for bad point at index ${entry.original.index}`);

                    // Fallback: Try interpolation between head and tail if available
                    if (entry.headNode && entry.tailNode) {
                        console.log(`  Using interpolation fallback between head and tail`);

                        // Calculate interpolated position (simple midpoint for now)
                        const headCoords = entry.headNode.geometry.coordinates;
                        const tailCoords = entry.tailNode.geometry.coordinates;
                        const interpolatedLon = (headCoords[0] + tailCoords[0]) / 2;
                        const interpolatedLat = (headCoords[1] + tailCoords[1]) / 2;

                        // Find the matching point in originalArray and update
                        for (const originalTrip of originalArray[route]) {
                            if (originalTrip[logid]) {
                                const originalPoints = originalTrip[logid];
                                for (let i = 0; i < originalPoints.length; i++) {
                                    if (originalPoints[i].index === entry.original.index) {
                                        const originalLat = originalPoints[i].coords[0];
                                        const originalLon = originalPoints[i].coords[1];

                                        // Calculate distance moved
                                        const distanceMoved = distanceInKmBetweenEarthCoordinates(
                                            originalLat, originalLon, interpolatedLat, interpolatedLon
                                        ) * 1000; // Convert to meters

                                        console.log(`  INTERPOLATION: Point ${entry.original.index}`);
                                        console.log(`    BEFORE: [${originalLat.toFixed(6)}, ${originalLon.toFixed(6)}]`);
                                        console.log(`    AFTER:  [${interpolatedLat.toFixed(6)}, ${interpolatedLon.toFixed(6)}]`);
                                        console.log(`    Distance moved: ${distanceMoved.toFixed(2)} meters`);

                                        // Update coordinates
                                        originalPoints[i].coords[0] = interpolatedLat;
                                        originalPoints[i].coords[1] = interpolatedLon;

                                        pointsModified++;
                                        pointsInterpolated++;
                                        totalDistanceMoved += distanceMoved;
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                    } else {
                        console.log(`  No head/tail available for interpolation, skipping`);
                        pointsSkippedNoRoads++;

                        // Track failed point for analysis
                        failedPoints.push({
                            index: entry.original.index,
                            coords: entry.original.coords,
                            accuracy: entry.original.accuracy,
                            reason: 'no_roads_no_interpolation'
                        });
                    }
                    continue;
                }

                //create a composite scoring system for all the candidates
                let roadScores = {}

                for (let roadIndex = 0; roadIndex < entry.nearbyRoads.length; roadIndex++){
                    const road = entry.nearbyRoads[roadIndex]
                    //distance score
                    const snapPoint = turf.nearestPointOnLine(road.lineString,entry.original.turfpoint, { units: 'meters' }) //this is the point we snap to later
                    const distMeters = snapPoint.properties.dist
                    //normalize the distance score:
                    //use exponential decay
                    const distanceScore = Math.exp(-distMeters / exponentialDecayFactor)

                    //heading score
                    let headingScore = 0.5; // Default neutral score if we can't calculate heading

                    // Check if we have both head and tail nodes to calculate vehicle heading
                    if (entry.headNode && entry.tailNode) {
                        //get the head and tail points - this is the vehicle heading
                        const vehicleHeading = turf.bearing(entry.headNode,entry.tailNode)
                        //road bearing
                        // snapped.properties.index gives which segment of the line
                        // the snap point fell on — the segment between node[i] and node[i+1]
                        const segIndex = snapPoint.properties.index
                        const lineCoords = road.geometry //array of [lon,lat] pairs

                        const nodeA = turf.point([lineCoords[segIndex].lon, lineCoords[segIndex].lat])
                        const nodeB = turf.point([lineCoords[segIndex+1].lon, lineCoords[segIndex+1].lat])

                        const roadBearing = turf.bearing(nodeA, nodeB)

                        // Check both directions of the road
                        const diff = Math.min(
                            angleDifference(vehicleHeading, roadBearing),
                            angleDifference(vehicleHeading, roadBearing + 180)
                        );
                        // diff is now 0-90: 0 = perfect match, 90 = perpendicular

                        headingScore = 1 - (diff / 90);
                        // 0° difference  → 1.0 (road perfectly aligned with travel direction)
                        // 45° difference → 0.5
                        // 90° difference → 0.0 (road is perpendicular to travel — wrong road)
                    } else {
                        // console.log(`No head/tail nodes for bad point at index ${entry.original.index}, using default heading score`);
                    }

                    //neighbor score

                    // Check if head and tail streets exist before accessing them
                    if (!entry.headStreets || entry.headStreets.length === 0 ||
                        !entry.tailStreets || entry.tailStreets.length === 0) {
                        // Skip neighbor scoring if we don't have head/tail street data
                        const neighborScore = 0.0;
                        const finalScore = (distanceWeight*distanceScore) + (headingWeight*headingScore) + (neighborWeight*neighborScore);
                        roadScores[roadIndex] = finalScore;
                        continue;
                    }

                    //the roads are sorted, closests distance first, so take the first road and snap to that one
                    const headClosestRoad = entry.headStreets[0].lineString
                    const tailClosestRoad = entry.tailStreets[0].lineString

                    // const headnode = entry.headNode
                    // const tailnode = entry.tailNode
                    
                    // const headSnapPoint = turf.nearestPointOnLine(headClosestRoad,headnode, { units: 'meters' })
                    // const tailSnapPoint = turf.nearestPointOnLine(tailClosestRoad, tailnode, { units: 'meters' })
                    // //rewrite the coordinates to snap the head and tail nodes
                    // entry.headNode = headSnapPoint
                    // entry.tailNode = tailSnapPoint

                    //check if each candidate road matches the neighbors 
                    const candidateRoad = road.id
                    const candidateRoadMatchHead = (candidateRoad === headClosestRoad.id)
                    const candidateRoadMatchTail = (candidateRoad === tailClosestRoad.id)

                    let neighborScore

                    if (candidateRoadMatchHead && candidateRoadMatchTail){
                        neighborScore = 1.0
                    } else if (candidateRoadMatchHead || candidateRoadMatchTail){
                        neighborScore = 0.5
                    } else {
                        neighborScore =  0.0
                    }

                    //compute the final score
                    const finalScore = (distanceWeight*distanceScore) + (headingWeight*headingScore) + (neighborWeight*neighborScore)
                    roadScores[roadIndex] = finalScore


                }

                //find the highest road score
                //thats the one we need to snap to

                // Check if we have any road scores (shouldn't happen after our checks, but safety first)
                const roadScoreEntries = Object.entries(roadScores);
                if (roadScoreEntries.length === 0) {
                    // console.log(`No road scores calculated for bad point at index ${entry.original.index}, skipping`);
                    pointsSkippedNoScores++;
                    continue;
                }

                const [winningIndex, winningScore] = roadScoreEntries.reduce((max, entry) =>
                    entry[1] > max[1] ? entry : max
                );

                const winningRoad = entry.nearbyRoads[parseInt(winningIndex)] //the chosen road object
                const winningSnapPoint = turf.nearestPointOnLine(winningRoad.lineString, entry.original.turfpoint, { units: 'meters' })

                const winningSnapPointCoordinates = winningSnapPoint.geometry.coordinates

                //need to rewrite the coordinates for the badpoint that we're targeting with our new coordinates
                //need to change the originalarray

                // Find the matching point in originalArray and update its coordinates
                for (const originalTrip of originalArray[route]) {
                    if (originalTrip[logid]) {
                        const originalPoints = originalTrip[logid];

                        // Find the point by index
                        for (let i = 0; i < originalPoints.length; i++) {
                            if (originalPoints[i].index === entry.original.index) {
                                // Store original coordinates for comparison
                                const originalLat = originalPoints[i].coords[0];
                                const originalLon = originalPoints[i].coords[1];

                                // Update the coordinates with the snapped location
                                // winningSnapPointCoordinates is [longitude, latitude]
                                const newLat = winningSnapPointCoordinates[1];
                                const newLon = winningSnapPointCoordinates[0];

                                // Calculate distance moved
                                const distanceMoved = distanceInKmBetweenEarthCoordinates(
                                    originalLat, originalLon, newLat, newLon
                                ) * 1000; // Convert to meters

                                // Validate the snap distance (should not be more than 200m for safety)
                                const maxSnapDistance = 200; // meters
                                if (distanceMoved > maxSnapDistance) {
                                    console.log(`WARNING: Point ${entry.original.index} would move ${distanceMoved.toFixed(2)}m (> ${maxSnapDistance}m limit), skipping snap`);
                                    break;
                                }

                                console.log(`SNAPPING Point ${entry.original.index}:`);
                                console.log(`  BEFORE: [${originalLat.toFixed(6)}, ${originalLon.toFixed(6)}]`);
                                console.log(`  AFTER:  [${newLat.toFixed(6)}, ${newLon.toFixed(6)}]`);
                                console.log(`  Distance moved: ${distanceMoved.toFixed(2)} meters`);
                                console.log(`  Winning road: ${winningRoad.name} (score: ${winningScore.toFixed(3)})`);

                                // Actually update the coordinates
                                originalPoints[i].coords[0] = newLat; // latitude
                                originalPoints[i].coords[1] = newLon; // longitude

                                pointsModified++;
                                totalDistanceMoved += distanceMoved;
                                break;
                            }
                        }
                        break;
                    }
                }

            }
        }
    }

    // Print enhanced summary statistics
    console.log('=== SNAP TO ROAD COMPLETE ===');
    console.log(`Total bad points found: ${totalBadPoints}`);
    console.log(`Points successfully processed: ${pointsModified}`);
    console.log(`  - Snapped to roads: ${pointsModified - pointsInterpolated}`);
    console.log(`  - Used interpolation: ${pointsInterpolated}`);
    console.log(`Points skipped (no solution): ${pointsSkippedNoRoads}`);
    console.log(`Points skipped (no road scores): ${pointsSkippedNoScores}`);
    console.log(`Average distance moved: ${pointsModified > 0 ? (totalDistanceMoved / pointsModified).toFixed(2) : 0} meters`);
    console.log(`Success rate: ${totalBadPoints > 0 ? ((pointsModified / totalBadPoints) * 100).toFixed(1) : 0}%`);

    // Log failed points summary if any
    if (failedPoints.length > 0) {
        console.log(`\n=== FAILED POINTS ANALYSIS ===`);
        console.log(`Total failed points: ${failedPoints.length}`);

        // Group failed points by geographic region
        const failedByRegion = {};
        for (const point of failedPoints) {
            const gridLat = Math.floor(point.coords[0] / 0.01) * 0.01;
            const gridLon = Math.floor(point.coords[1] / 0.01) * 0.01;
            const gridKey = `${gridLat.toFixed(2)},${gridLon.toFixed(2)}`;
            failedByRegion[gridKey] = (failedByRegion[gridKey] || 0) + 1;
        }

        console.log('Top regions with failed points:');
        const sortedRegions = Object.entries(failedByRegion)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        for (const [region, count] of sortedRegions) {
            console.log(`  ${region}: ${count} points`);
        }
    }

    //return the finished map snapped object with updated coordinates
    console.log(JSON.stringify(originalArray,null,2))
    return originalArray

}

function angleDifference(bearing1, bearing2) {
    let diff = Math.abs(bearing1 - bearing2) % 360;
    if (diff > 180) diff = 360 - diff;
    return diff;
}

//export data to the server.js 
export async function load_map_snap_data(){
    const MapSnapped = await snapToRoad()
    return {mapMatch : MapSnapped }
}