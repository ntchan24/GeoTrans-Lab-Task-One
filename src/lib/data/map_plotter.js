//load specific trips 
//handles plotting points on the map : gps coordinate, gps accuracy, timestamp
// connect the lines for distance and speed 
//speed is distance over time 
//take the distance between gps points and divide by time inbetween timestamps
//each capture log is a trip

//for each trip we need to find the points / entries 

import data from '../coe-snic-default-rtdb-logs-export.json'

import { normalizeEntries,degreesToRadians, distanceInKmBetweenEarthCoordinates, extractLogIds } from './processing_script.js'

//pass data to server
export function load_map_data(){
    return{
        routeids:pointsProcessing(data)
    }
}


function getRouteIds(data) {
    const logids = extractLogIds(data);
    const sensor_suffixes = ["_SE", "_NW", "_CENTRAL", "_RWIS","_RWIS_SW"];
    const routeids = {SE:[],NW:[],CENTRAL:[],RWIS:[],RWIS_SW:[]}



    for (const logid of logids){
        for (const suffix of sensor_suffixes){
            //goes through each log id, checks if they end with any of the suffixes
            if (logid.endsWith(suffix) === true){
                const suffix_string = suffix.slice(1) //get the string so i can index the json/dict object

                // console.log(suffix_string,logid)
                // console.log(typeof suffix_string)

                routeids[suffix_string].push(logid); //store the log id in the object - use bracket notation
            }
        }
    }


    return routeids

}

function pointsProcessing(data){
    const routeids = getRouteIds(data) //each trip per route
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
                        const timestamp = entry.timestamp;

                        const pointObject = {
                            accuracy: gps_coords.accuracy,
                            lat: gps_coords.latitude,
                            long: gps_coords.longitude,
                            time: timestamp
                        }
                        tripPoints.push(pointObject)
                    }
                }

                // Store the trip with its log ID
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