import { extractData } from "$lib/data/processing_script";

export function load(){
    return extractData();
    //passes data into the page 
}


// //try in the server file first 
// import data from '/Users/nathanielchan/Desktop/geotranslab/first_task_app/src/lib/coe-snic-default-rtdb-logs-export.json'

// export function load(){
//     // Return an object with properties that will be available in +page.svelte
//     return {
//         jsonData: data,
//         // You can add more properties here if needed
//         timestamp: new Date().toISOString()
//     }
// }