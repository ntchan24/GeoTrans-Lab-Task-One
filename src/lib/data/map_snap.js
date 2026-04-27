//here is where we handle the points snapping to road ground truth 

/*
general flow of the program:
load data from json file 
find the inaccurate points 
find the roads surrounding the inaccurate points 
**this involves building a spatial index and a function that finds roads around the point 
*/
 
import data from '../coe-snic-default-rtdb-logs-export.json' with { type: "json" }
import * as Plotter from './map_plotter.js';
import { normalizeEntries, distanceInKmBetweenEarthCoordinates, extractLogIds } from './processing_script.js'
import KDBush from 'kdbush';
import * as geokdbush from 'geokdbush';
import * as turf from '@turf/turf';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';


// Load road data from JSON file
function loadRoadDataFromFile(folderName, filename) {
    try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const exportdata = JSON.parse(readFileSync(path.join(__dirname, folderName, filename), 'utf-8'))
        console.log("data fetched")
        return exportdata
    } catch (error) {
       console.error(error)
    }
}


function returnPoints(road_data, headingWeight = 0.05, neighborWeight=0.90,  roadTypePriorityWeight = 0.05, tolerance = 10){
    //identifies the points with gps accuracy more than the tolerance, changes the object in line

    console.log('returnPoints called with weights:', {
        headingWeight,
        neighborWeight,
        roadTypePriorityWeight,
        sum: headingWeight + neighborWeight + roadTypePriorityWeight
    });

    //when we have an accurate point, we have a head
    //keep that head until we get an inaccurate point
    //when we get an inaccurate point, find the tail by iterating through until

    // Get the processed data with proper index and structure
    const processedData = Plotter.lineDistancesSpeed(data) //this is the original data 

    //build spatial index to use for road matching
    const {index: spatialIndex, points: spatialPoints} = buildSpatialIndex(road_data.elements || [])


    for (const route of Object.keys(processedData)){
        // Iterate through each trip in this route
        for (const tripData of processedData[route]){
            const logid = Object.keys(tripData)[0]
            const points = tripData[logid]

            let head = null
            let tail = null

            for (const point of points){
                point.snapped = false
                


                if (points.indexOf(point) < points.length - 1){ //check that its not the last point

                    if (point.accuracy > tolerance){
                        

                        //skip if no head or tail
                        if (head !== null){
                            //find roads near the head 

                            //find a tail 
                            let tailFound = false
                            let tailIndex = (points.indexOf(point)) + 1
                            while (tailFound === false && tailIndex < points.length){
                                //check point for accuracy
                                const tailpoint = points[tailIndex]
                                if (tailpoint && tailpoint.accuracy < tolerance) {
                                    tail = tailpoint
                                    tailFound = true
                                } else {
                                    tailIndex++
                                }
                            }

                            //at this point we should have found head and tail
                            //find nearby roads
                            if (head !== null){
                                console.log("found head ")
                            }

                            if (tail !== null){
                                console.log('found tail ')
                            }



                            const gpsPoint_head = {
                                lon: head.coords[1],  // longitude
                                lat: head.coords[0]   // latitude
                            }

                            const gpsAccuracyHead = head.accuracy || 20; // Default to 20m if not specified
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
                                road_data.elements,
                                maxPointsToReturnHead,  // Dynamic based on search radius
                                searchRadiusKmHead,
                                true  // Enable progressive search
                            )


                            const gpsPoint_tail = {
                                lon: tail.coords[1],  // longitude
                                lat: tail.coords[0]   // latitude
                            }

                            const gpsAccuracyTail = tail.accuracy || 20; // Default to 20m if not specified
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
                                road_data.elements,
                                maxPointsToReturnTail,  // Dynamic based on search radius
                                searchRadiusKmTail,
                                true  // Enable progressive search
                            )

                            //we should now have head and tail streets 

                            //find the badpoint streets
                            const gpsPoint_badpoint = {
                                lon: point.coords[1],
                                lat: point.coords[0]
                            }

                            const gpsAccuracybadpoint = point.accuracy || 20; // Default to 20m if not specified
                            let searchRadiusKmbadpoint;
                            let maxPointsToReturnbadpoint;

                            if (gpsAccuracybadpoint < 20) {
                                searchRadiusKmbadpoint = 0.05; // 50m for accurate GPS
                                maxPointsToReturnbadpoint = 30; // Enough for complex intersections
                            } else if (gpsAccuracybadpoint < 50) {
                                searchRadiusKmbadpoint = 0.1;  // 100m for moderate accuracy
                                maxPointsToReturnbadpoint = 50; // More points for larger radius
                            } else {
                                // For poor accuracy, use 1.5x the accuracy, max 200m
                                searchRadiusKmbadpoint = Math.min(0.2, gpsAccuracybadpoint * 1.5 / 1000);
                                maxPointsToReturnbadpoint = 100; // Many points for largest radius
                            }

                            const nearbyRoads_badpoint = findCloseRoads(
                                gpsPoint_badpoint,
                                spatialIndex,
                                spatialPoints,
                                road_data.elements,
                                maxPointsToReturnbadpoint,  // Dynamic based on search radius
                                searchRadiusKmbadpoint,
                                true  // Enable progressive search
                            )

                            // console.log(nearbyRoads_head)
                            // console.log(nearbyRoads_tail)
                            // console.log(nearbyRoads_badpoint)
                            console.log(`head ${nearbyRoads_head.length}, tail ${nearbyRoads_tail.length}, badpoint ${nearbyRoads_badpoint.length}`)

                            //we found roads for head, tail and badpoint , time for the snapping 

                            // Create turf point from coords [lat, lon] -> [lon, lat]
                            const turfPointBadpoint = turf.point([point.coords[1], point.coords[0]])


                            //do the same for the head and tail 

                            const turfPointHead = [head.coords[1], head.coords[0]]
                            const turfPointTail = [tail.coords[1], tail.coords[0]]


                            //create a scoring system for all the candidate roads 
                            //ie the roads near the badpoint 
                            let roadScores = {}

                            for (let roadIndex = 0; roadIndex < nearbyRoads_badpoint.length; roadIndex++){
                                const road = nearbyRoads_badpoint[roadIndex]
                                const snapPoint = turf.nearestPointOnLine(road.lineString,turfPointBadpoint, {units: 'meters'})
                                const distMeters = snapPoint.properties.dist
                                //heading score 
                                let headingScore
                                //check if we have both head and tail nodes 
                                if (head && tail){
                                    //vehicle heading 
                                    const vehicleHeading = turf.bearing(turfPointHead,turfPointTail)

                                    //road bearing 
                                    // snapped.properties.index gives which segment of the line
                                    // the snap point fell on — the segment between node[i] and node[i+1]
                                    const segIndex = snapPoint.properties.index
                                    const lineCoords = road.geometry //array of objects with {lon, lat} properties

                                    // Bounds checking to prevent accessing undefined elements
                                    if (!lineCoords || lineCoords.length === 0) {
                                        console.warn(`Road ${road.id} has no geometry coordinates`)
                                        headingScore = 0.5 // Default neutral score
                                    } else if (segIndex >= lineCoords.length - 1) {
                                        // If segIndex points to or beyond the last element, use last segment
                                        const lastIdx = lineCoords.length - 1
                                        const nodeA = turf.point([lineCoords[lastIdx - 1].lon, lineCoords[lastIdx - 1].lat])
                                        const nodeB = turf.point([lineCoords[lastIdx].lon, lineCoords[lastIdx].lat])
                                        const roadBearing = turf.bearing(nodeA, nodeB)

                                        // Check both directions of the road
                                        const diff = Math.min(
                                            angleDifference(vehicleHeading, roadBearing),
                                            angleDifference(vehicleHeading, roadBearing + 180)
                                        );
                                        headingScore = 1 - (diff / 90);
                                    } else {
                                        // Normal case: segIndex is valid
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
                                    }

                                } else {
                                    console.log("head or tail not found ")
                                }


                                //neighbor score 

                                //should i check if head and tail streets exist before accessing them?

                                const headClosestRoad= nearbyRoads_head[0].lineString
                                const tailClosestRoad = nearbyRoads_tail[0].lineString

                                //chjeckl if the candidate road matches the neighbors
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
                                //road type score:
                                //primary motorways get highest score, etc 
                                const roadType = road.highway
                                let roadTypePriority = getRoadPriority(roadType);

                                const finalScore = (roadTypePriority*roadTypePriorityWeight) + (headingWeight*headingScore) + (neighborWeight*neighborScore)
                                roadScores[roadIndex] = finalScore

                                



                            }

                            //find the winning / highest road score here 
                            const roadScoreEntries = Object.entries(roadScores);
                            const [winningIndex, winningScore] = roadScoreEntries.reduce((max, entry) =>
                                entry[1] > max[1] ? entry : max
                            );

                            const winningRoad = nearbyRoads_badpoint[parseInt(winningIndex)] //the chosen road object
                            const winningSnapPoint = turf.nearestPointOnLine(winningRoad.lineString, turfPointBadpoint, { units: 'meters' }) //point to snap to 

                            const winningSnapPointCoordinates = winningSnapPoint.geometry.coordinates

                            //update the coordinates for badpoint 
                            console.log(winningSnapPointCoordinates)
                            
                            point.coords = [winningSnapPointCoordinates[1],winningSnapPointCoordinates[0]]

                            point.snapped = true

                            // Store only essential road info (not the full object with lineString)
                            point.snappedRoad = {
                                id: winningRoad.id,
                                name: winningRoad.name,
                                highway: winningRoad.highway
                            }


                        } else{
                            console.log('no head found ')
                        }
                    } else {
                        head = point //we have a new head 
                    }
                }
            }
        }
    }

    return processedData
}

function getRoadPriority(roadType) {
    //weighted priorities for all the different kinds of roads 
    const priorities = {
        'motorway': 1.0,
        'trunk': 0.95,
        'primary': 0.9,
        'secondary': 0.85,
        'tertiary': 0.8,
        'motorway_link': 0.75,
        'trunk_link': 0.7,
        'residential': 0.6,
        'unclassified': 0.5,
        'living_street': 0.4,
        'service': 0.3,
        'footway': 0.1,
        'cycleway': 0.1,
        'pedestrian': 0.05,
        'track': 0.05
    };
    return priorities[roadType] || 0.2;
}

function buildSpatialIndex(elements){
    // Validate input
    if (!Array.isArray(elements)) {
        console.error('buildSpatialIndex: elements must be an array, received:', typeof elements);
        return { index: null, points: [] };
    }

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

            // Validate that road exists and has geometry
            if (!road) {
                console.warn(`Warning: No road found at wayIndex ${pt.wayIndex}`);
                continue;
            }

            if (!road.geometry || !Array.isArray(road.geometry) || road.geometry.length === 0) {
                console.warn(`Warning: Road ${road.id || 'unknown'} at wayIndex ${pt.wayIndex} has no valid geometry`);
                continue;
            }

            // Calculate distance to this specific point
            const distance = distanceInKmBetweenEarthCoordinates(
                gpsPoint.lat,
                gpsPoint.lon,
                pt.lat,
                pt.lon
            );

            //turn the geometry object into real turf.linestring

            const line = turf.lineString(road.geometry.map(pt => [pt.lon, pt.lat]));

            //we want to exclude certain roads, ie footpaths
            
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

    return nearbyRoads; //list of nearby roads 

}

function angleDifference(bearing1, bearing2) {
    let diff = Math.abs(bearing1 - bearing2) % 360;
    if (diff > 180) diff = 360 - diff;
    return diff;
}

//export data to the server.js
export async function load_map_snap_data({threshold, mode, headingWeight, neighborWeight, roadTypePriorityWeight}){

    if (mode === "snapped"){
        const road_data = loadRoadDataFromFile("overpassapiwebdata","export.json")

        // Use provided weights or defaults
        const hWeight = headingWeight ?? 0.05;
        const nWeight = neighborWeight ?? 0.90;
        const rWeight = roadTypePriorityWeight ?? 0.05;

        const MapSnapped = returnPoints(road_data, hWeight, nWeight, rWeight)

        return {mapMatch : MapSnapped }
    }

    const originalData = await Plotter.load_map_data();
    return { mapMatch: originalData.routeids };

}
