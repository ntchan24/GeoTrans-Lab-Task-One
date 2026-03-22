// Test script to verify the snap-to-road improvements
import { load_map_snap_data } from './src/lib/data/map_snap.js';

console.log('=== TESTING SNAP-TO-ROAD IMPROVEMENTS ===');
console.log('This will fetch road data with expanded types and use progressive search...');
console.log('');

async function test() {
    try {
        const startTime = Date.now();

        // Run the snap-to-road with improved algorithm
        const result = await load_map_snap_data();

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log('');
        console.log(`=== TEST COMPLETE ===`);
        console.log(`Execution time: ${duration.toFixed(1)} seconds`);

        // The function returns the snapped data
        if (result && result.mapMatch) {
            console.log('Map matching completed successfully');
            console.log('Check the console output above for detailed statistics');
        } else {
            console.log('Map matching failed');
        }

    } catch (error) {
        console.error('Test failed with error:', error);
        console.error('Stack trace:', error.stack);
    }
}

test();