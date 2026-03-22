//load specific trips 
//handles plotting points on the map : gps coordinate, gps accuracy, timestamp
// connect the lines for distance and speed 
//speed is distance over time 
//take the distance between gps points and divide by time inbetween timestamps
//each capture log is a trip

//for each trip we need to find the points / entries 

import data from '../coe-snic-default-rtdb-logs-export.json'
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

import { normalizeEntries, distanceInKmBetweenEarthCoordinates, extractLogIds } from './processing_script.js'

//pass data to server
export function load_map_data(){
    // return {routeids : pointsProcessing(data)}
    return {routeids : lineDistancesSpeed(data)}


}

export function lineDistancesSpeed(data){
    const processedRoutes = pointsProcessing(data)

    //in between points for every trip, find the distance and speed and store it in between points as an object 
    //take one point i, check if there is a i+1 point. only do something if there is something 
    for (const route of Object.keys(processedRoutes)){
        // console.log(route)
        for (const trip of processedRoutes[route]){
            const logId = Object.keys(trip)[0]
            const points = trip[logId]
            
            for (let i = 0; i<points.length;i++){
                //if a next point exists do this. if not, its the last point and there is no distance or speed to be calculated 
                if (i+1<points.length){
                    const point1 = points[i]
                    const point2 = points[i+1]


                    const distance = distanceInKmBetweenEarthCoordinates(point1.coords[0], point1.coords[1], point2.coords[0], point2.coords[1])
                    const timebetweenpoints = timeBetweenPoints(point1.time, point2.time)

                    // Calculate speed in km/h
                    let speed = distance / timebetweenpoints

                    //add attributes to the points object
                    point1.distancetoNext = distance
                    point1.speedBetweenNext = speed
                }
            }
        }
    }
    // console.log(processedRoutes)
    return processedRoutes
}

export function pointsProcessing(data){
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
                            index: entries.indexOf(entry),
                            accuracy: gps_coords.accuracy,
                            coords:[gps_coords.latitude,gps_coords.longitude],
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

export function getRouteIds(data) {
    const logids = extractLogIds(data);
    const sensor_suffixes = ["_SE", "_NW", "_CENTRAL", "_RWIS","_RWIS_SW","_SW"];
    const routeids = {SE:[],NW:[],CENTRAL:[],RWIS:[],RWIS_SW:[],SW:[]}



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




export function timeBetweenPoints(point1time,point2time){
    //handle day rollover too 
    const time1 = dayjs(point1time)
    const time2 = dayjs(point2time)

    const diff = dayjs.duration(time2.diff(time1))

    return diff.asHours() 
}