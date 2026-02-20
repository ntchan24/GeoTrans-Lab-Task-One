//this is where the json data is processed

import data from '../coe-snic-default-rtdb-logs-export.json'
//import from src/lib/coe-snic-default-rtdb-logs-export.json

// Helper function to normalize entries - converts object to array and filters nulls
function normalizeEntries(entries) {
    if (!entries) return [];

    // If entries is an object (not an array), convert it to array
    if (!Array.isArray(entries)) {
        return Object.values(entries).filter(entry => entry !== null && entry !== undefined);
    }

    // If it's already an array, just filter out nulls
    return entries.filter(entry => entry !== null && entry !== undefined);
}

//get the actual data straight up
export function extractData() {
    const times_of_day = getTimesOfDay(data);
    return {
            jsonData: data,
            logids : extractLogIds(data),
            timestamp: new Date().toISOString(),
            times_of_day: times_of_day,
            bins: create_bins(times_of_day),
            sensors: separateSensors_create_bins(data),
            distances: distanceFinder(data)

        }

    //passes data into server when its called
}

function extractTimes(data){
    //find all the different timestamps

    //put the timestamps into a list for processing
    let timestamps = [];

    for (const [logId, log] of Object.entries(data)){
        const entries = normalizeEntries(log.entries); //normalize to handle objects and nulls
        for (const entry of entries){
            if (!entry || !entry.timestamp) continue; //check for valid entry with timestamp
            timestamps.push(entry.timestamp)
        }
    }

    return timestamps

}

function getTimesOfDay(data){
    const timestamps = extractTimes(data);
    let times_of_day  = [];
    for (const timestamp of timestamps){
        const string = String(timestamp)
        times_of_day.push(string.slice(11,19))
    }
    return times_of_day

}

function extractLogIds(data){
    const logIds = Object.keys(data);
    return logIds
}




//need to create bins for TOD histogram 
function create_bins(timestamps, bincount = 24){
     //every hour?
        const hours = timestamps.map(function(timestamp) {
            if (timestamp[0] === 0){
                return parseInt(timestamp[1]);
            } else{
                return parseInt(timestamp.slice(0,2), 10);
            }


        });
        // console.log(hours)
        // const count = hours.filter(x => x === 3).length;
        // console.log(count)

        const bins = Array(bincount).fill(0); //initialize an array of counters for each hour of the day, start them at zero   
        hours.map(function(hour){
            bins[hour]++; //increment the counter for the hour             
        });
        
        return bins
    }

function separateSensors_create_bins(data){
    //separate _SE, _NW, _CENTRAL, and _RWIS (Note the RWIS one can have _SW pre-fixed to it as well).
    const logids = extractLogIds(data);
    const sensor_suffixes = ["_SE", "_NW", "_CENTRAL", "_RWIS","_RWIS_SW"] //these are the logs we want to get 
    const final_suffix_labels = ["_SE", "_NW", "_CENTRAL", "_RWIS"] //these are the final labels for the graph 
    const bins = Array(sensor_suffixes.length).fill(0)

    //separate them into bins that can be displayed on a bar chart 
    for (const logid of logids){
        for (const suffix of sensor_suffixes){
            //goes through each log id, checks if they end with any of the suffixes
            if (logid.endsWith(suffix) === true){
                //if one does, we find the index of the suffix and we increment a counter for that suffix (bins)
                //labels and bins are in the same order so they'll match up later 

                //for each different sensor i have to aggregate the entries and count them 
                const entries_count = data[logid].entriesCount; //we need to access the entriescount value for each matching capture log 
                const suffix_index = sensor_suffixes.indexOf(suffix)
                bins[suffix_index] += entries_count; //increment by the entries log 
            }
        }
    }

    //since RWIS SW can also be RWIS we need to combine them in the bins 
    bins[bins.length - 2] += bins.pop();

    // console.log(final_suffix_labels,bins);
    return [final_suffix_labels, bins]
    //this is for the "which sensors have gathered the most data graph"
}



function distanceFinder (data) {
    //find out which sensor travelled the farthest
    //for each sensor, get the entries, find the distance between gps logs per entry and add them up!
    //find final distances for the sensors

    //separate _SE, _NW, _CENTRAL, and _RWIS (Note the RWIS one can have _SW pre-fixed to it as well).
    const logids = extractLogIds(data);
    const sensor_suffixes = ["_SE", "_NW", "_CENTRAL", "_RWIS","_RWIS_SW"] //these are the logs we want to get
    const final_suffix_labels = ["_SE", "_NW", "_CENTRAL", "_RWIS"] //these are the final labels for the graph

    const distances = Array(sensor_suffixes.length).fill(0)//total distance for each sensor

    const distances_for_sensor = {}
    sensor_suffixes.forEach(suffix => distances_for_sensor[suffix] = []);


    for (const suffix of sensor_suffixes){ //find all the log ids for each suffix
        const latitudes = new Array();
        const longitudes = new Array();


        for (const logid of logids){

            if (logid.endsWith(suffix) === true){

                const logid_entries = normalizeEntries(data[logid].entries);  //normalize entries to handle objects and nulls

                for (const entry of logid_entries){
                    //check if entry has GPS data before trying to access it
                    if (!entry || !entry.gps || !entry.gps.latitude || !entry.gps.longitude) {
                        continue; //skip entries without valid GPS data
                    }

                    //for each entry get the lat and long
                    const lat = entry.gps.latitude;
                    const long = entry.gps.longitude;

                    latitudes.push(lat);
                    longitudes.push(long);


                }
            }
        }

        //find the distances then add them up
        let i = 0;
        while(i < latitudes.length - 1){ //stop one before the end to avoid undefined
            const latitude1 = latitudes[i]
            const longitude1 = longitudes[i]

            const latitude2 = latitudes[i+1]
            const longitude2 = longitudes[i+1]
            //first and next coords

            const distance = distanceInKmBetweenEarthCoordinates(latitude1,longitude1,latitude2,longitude2); //returns a km value
            
            distances_for_sensor[suffix].push(distance)

            const suffix_index = sensor_suffixes.indexOf(suffix)
            if (!isNaN(distance)) { //only add valid distances, nyull check 
                distances[suffix_index] += distance;
                
            }

            i++
        }

    }

        //since RWIS SW can also be RWIS we need to combine them in the bins 
    distances[distances.length - 2] += distances.pop();
    // Merge _RWIS_SW into _RWIS
    distances_for_sensor["_RWIS"].push(...distances_for_sensor["_RWIS_SW"]);

    // Remove _RWIS_SW
    delete distances_for_sensor["_RWIS_SW"];


    console.log(final_suffix_labels,distances, distances_for_sensor);
    return [final_suffix_labels, distances,distances_for_sensor]
}


// Source - https://stackoverflow.com/a/365853
// Posted by cletus, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-20, License - CC BY-SA 4.0

function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

//this returns kms unit
function distanceInKmBetweenEarthCoordinates(lat1, lon1, lat2, lon2) {
    var earthRadiusKm = 6371;
    
    var dLat = degreesToRadians(lat2-lat1);
    var dLon = degreesToRadians(lon2-lon1);
    
    lat1 = degreesToRadians(lat1);
    lat2 = degreesToRadians(lat2);

    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return earthRadiusKm * c;
}
