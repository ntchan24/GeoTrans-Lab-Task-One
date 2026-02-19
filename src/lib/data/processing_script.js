//this is where the json data is processed 

import data from '../coe-snic-default-rtdb-logs-export.json'
//import from src/lib/coe-snic-default-rtdb-logs-export.json

//get the actual data straight up
export function extractData() {
    const times_of_day = getTimesOfDay(data);
    return {
            jsonData: data,
            logids : extractLogIds(data),
            timestamp: new Date().toISOString(),
            times_of_day: times_of_day,
            bins: create_bins(times_of_day),
            sensors: separateSensors_create_bins(data)

        }

    //passes data into server when its called
}

function extractTimes(data){
    //find all the different timestamps 

    //put the timestamps into a list for processing 
    let timestamps = [];

    for (const [logId, log] of Object.entries(data)){
        if (!Array.isArray(log.entries)) continue; //check for null entries 
        for (const entry of log.entries){
            if (!entry) continue; //also check for null entries 
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

    console.log(final_suffix_labels,bins);
    return [final_suffix_labels, bins]
    //this is for the "which sensors have gathered the most data graph"
}

