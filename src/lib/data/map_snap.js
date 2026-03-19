//here is where we handle the points snapping to road ground truth 
 
import data from '../coe-snic-default-rtdb-logs-export.json'
import * as Plotter from './map_plotter';
import { normalizeEntries, distanceInKmBetweenEarthCoordinates, extractLogIds } from './processing_script.js'
import KDBush from 'kdbush';
import * as geokdbush from 'geokdbush';
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

export async function load_map_snap_data(){
    // return {routeids : Plotter.lineDistancesSpeed(data)}

    // MapSnapped is now async, so we need to await it
    const snappedPoints = await MapSnapped(data);

    // console.log(snappedPoints)
    return {mapMatch : snappedPoints}
}


//fetch the road map data from overpass api 
//there is a rate limit, so we don't need to fetch every time 

async function fetchOverpass(bbox=[53.50, -113.60, 53.61, -113.47], retries = 3){
    // Expanded bbox to cover all your GPS points
    // Original was too small: [53.52, -113.53, 53.55, -113.49]

    // Filter for main road types to reduce data size
    const query = `
    [out:json][timeout:90];
    (
        way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"](${bbox.join(",")});
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
    //identifies the points with gps accuracy more than 5 m 
    const routeids = Plotter.getRouteIds(data)
    const processedRoutes = {}

    for (const route of Object.keys(routeids)){
        processedRoutes[route] = []

        // Iterate through each log ID in this route
        for (const logid of routeids[route]){
            if (data[logid] && data[logid]["entries"]){
                const raw_entries = data[logid]["entries"]
                const entries = normalizeEntries(raw_entries)
                

                const tripPoints = []
                for (const entry of entries){
                    if (entry && entry.gps){ //check for nulls

                        const gps_coords = entry.gps;
                        
                        //store the point only if its deemed an inaccurate point 
                        if (gps_coords.accuracy > tolerance){

                            const pointObject = {
                            accuracy: gps_coords.accuracy,
                            coords:[gps_coords.latitude,gps_coords.longitude],
                            }

                            tripPoints.push(pointObject)
                        }
                        
                    }
                }

                // Store the trip w its points  with its log ID
                if (tripPoints.length > 0){
                    processedRoutes[route].push({
                        [logid]:tripPoints
                    })
                }
            }
        }
    }
    // console.log(processedRoutes)
    return processedRoutes
}


function buildSpatialIndex(elements){
    
    //flatten all geometry points into one array 
    const points = []

    elements.forEach((way,wayIndex)=>{
        if (!way.geometry) return undefined //check for null entries 

        way.geometry.forEach((coord,coordIndex) =>{
            points.push({
                lon: coord.lon,
                lat: coord.lat,
                wayIndex,
                coordIndex
            })
        })
    })

    //we need to build a spatial index
    //data structure that knows where things are sptially, relative to each other 
    const index = new KDBush(points.length)
    for (const pt of points){
        index.add(pt.lon,pt.lat)
    }
    index.finish()

    return {index, points}


}
    

function findCloseRoads(gpsPoint, index, points, elements, maxPointsReturned, maxDistKM = 0.05){
    //geokdbush.around returns the indices into the kdbush index of points within maxdistkm of the gps point

    //50 meter radius for snapping

    const nearbyIndices = geokdbush.around(
        index,
        gpsPoint.lon,
        gpsPoint.lat,
        maxPointsReturned,
        maxDistKM
    )

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

            // Create road info object with ID and metadata
            nearbyRoads.push({
                id: road.id,
                type: road.type,
                tags: road.tags || {},
                name: road.tags?.name || 'Unnamed',
                highway: road.tags?.highway || 'unknown',
                distance: distance * 1000, // Convert to meters
                wayIndex: pt.wayIndex
            });
        }
    }

    return nearbyRoads;

}

function findNearestPointOnLine(){

}


async function MapSnapped(){
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

    const badpoints = returnPoints(data)

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
                    searchRadiusKm
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
    // console.log(`Map snapping summary: ${pointsWithRoads}/${totalPointsProcessed} points matched to roads (${(pointsWithRoads/totalPointsProcessed*100).toFixed(1)}%)`);

    // // Analyze unmatched points
    // let unmatchedByAccuracy = {
    //     'high': { range: '< 20m', count: 0, points: [] },
    //     'moderate': { range: '20-50m', count: 0, points: [] },
    //     'poor': { range: '50-100m', count: 0, points: [] },
    //     'very_poor': { range: '> 100m', count: 0, points: [] }
    // };

    // for (const route of Object.keys(snappedResults)) {
    //     for (const tripData of snappedResults[route]) {
    //         const logId = Object.keys(tripData)[0];
    //         for (const point of tripData[logId]) {
    //             if (point.nearbyRoadsCount === 0) {
    //                 const accuracy = point.original.accuracy || 20;
    //                 const sample = {
    //                     coords: point.original.coords,
    //                     accuracy: accuracy
    //                 };

    //                 if (accuracy < 20) {
    //                     unmatchedByAccuracy.high.count++;
    //                     if (unmatchedByAccuracy.high.points.length < 2) {
    //                         unmatchedByAccuracy.high.points.push(sample);
    //                     }
    //                 } else if (accuracy < 50) {
    //                     unmatchedByAccuracy.moderate.count++;
    //                     if (unmatchedByAccuracy.moderate.points.length < 2) {
    //                         unmatchedByAccuracy.moderate.points.push(sample);
    //                     }
    //                 } else if (accuracy < 100) {
    //                     unmatchedByAccuracy.poor.count++;
    //                     if (unmatchedByAccuracy.poor.points.length < 2) {
    //                         unmatchedByAccuracy.poor.points.push(sample);
    //                     }
    //                 } else {
    //                     unmatchedByAccuracy.very_poor.count++;
    //                     if (unmatchedByAccuracy.very_poor.points.length < 2) {
    //                         unmatchedByAccuracy.very_poor.points.push(sample);
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }

    // console.log('\nUnmatched points analysis by GPS accuracy:');
    // for (const [key, data] of Object.entries(unmatchedByAccuracy)) {
    //     if (data.count > 0) {
    //         console.log(`  ${data.range}: ${data.count} unmatched`);
    //         for (const point of data.points) {
    //             console.log(`    Example: [${point.coords[0].toFixed(4)}, ${point.coords[1].toFixed(4)}] accuracy: ${point.accuracy.toFixed(1)}m`);
    //         }
    //     }
    // }

    // // Log a sample of matched roads
    // if (pointsWithRoads > 0) {
    //     console.log("Sample of matched roads:");
    //     let sampleCount = 0;
    //     for (const route of Object.keys(snappedResults)) {
    //         for (const tripData of snappedResults[route]) {
    //             const logId = Object.keys(tripData)[0];
    //             for (const point of tripData[logId]) {
    //                 if (point.nearbyRoadsCount > 0 && sampleCount < 3) {
    //                     console.log(`  Point at [${point.original.coords[0].toFixed(4)}, ${point.original.coords[1].toFixed(4)}] matched ${point.nearbyRoadsCount} road(s):`);
    //                     for (const road of point.nearbyRoads.slice(0, 2)) {
    //                         console.log(`    - ${road.name} (${road.highway}), ID: ${road.id}, Distance: ${road.distance.toFixed(1)}m`);
    //                     }
    //                     sampleCount++;
    //                 }
    //             }
    //         }
    //     }
    // }
    console.log(JSON.stringify(snappedResults, null, 2))
    return snappedResults;
}
