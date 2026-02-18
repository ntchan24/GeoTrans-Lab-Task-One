//this is where the json data is processed 

import data from '../coe-snic-default-rtdb-logs-export.json'
//import from src/lib/coe-snic-default-rtdb-logs-export.json

//get the actual data straight up
export function extractData() {
    const times_of_day = getTimesOfDay(data);
    return {
            jsonData: data,
            logids : extractLogIds(data),
            // capture_log_times:extractTimes(data),
            timestamp: new Date().toISOString(),
            times_of_day: times_of_day,
            bins: create_bins(times_of_day)
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
        const count = hours.filter(x => x === 3).length;
        console.log(count)

        const bins = Array(bincount).fill(0); //initialize an array of counters for each hour of the day, start them at zero   
        hours.map(function(hour){
            bins[hour]++; //increment the counter for the hour             
        });
        
        return bins
    }

function separateSensors(data){
    //separate _SE, _NW, _CENTRAL, and _RWIS (Note the RWIS one can have _SW pre-fixed to it as well).
}