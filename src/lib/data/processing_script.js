//this is where the json data is processed 

import { toDimension } from 'chart.js/helpers';
import data from '../coe-snic-default-rtdb-logs-export.json'
//import from src/lib/coe-snic-default-rtdb-logs-export.json

//get the actual data straight up
export function extractData() {
    return {
            jsonData: data,
            logids : extractLogIds(data),
            // capture_log_times:extractTimes(data),
            timestamp: new Date().toISOString(),
            times_of_day: getTimesOfDay(data)
            // capture_timestamps : extractTimes(data)
        }

    //passes data into server when its called 
}

function extractTimes(data){
    //find all the different timestamps 

    //put the timestamps into a list for processing 
    let timestamps = [];

    for (const [logId, log] of Object.entries(data)){
        if (!Array.isArray(log.entries)) continue;
        for (const entry of log.entries){
            if (!entry) continue;
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

function flattenData (data){
    //flatten the data into a single array
    const allEntries = Object.entries(data).flatMap(([logId, log]) =>
    log.entries.map(entry => ({
    logId,
    image: entry.image,
    lat: entry.gps.latitude,
    lng: entry.gps.longitude,
    accuracy: entry.gps.accuracy,
    timestamp: entry.timestamp,
    downloadUrl: entry.downloadUrl,
    uploadStatus: entry.uploadStatus
  }))
);
    return allEntries
}