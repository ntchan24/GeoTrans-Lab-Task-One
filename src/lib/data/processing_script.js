//this is where the json data is processed 

import data from '../coe-snic-default-rtdb-logs-export.json'
//import from src/lib/coe-snic-default-rtdb-logs-export.json

export function extractData() {
    return {
            jsonData: data,
            
            timestamp: new Date().toISOString()
        }

    //passes data into server when its called 
}