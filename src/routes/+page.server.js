import { extractData } from "$lib/data/processing_script";
import { load_map_data } from "$lib/data/map_plotter";
import { load_map_snap_data, load_snap_quality_data } from "$lib/data/map_snap";
import { redirect } from "@sveltejs/kit";

export async function load({locals,url}){
    if (!locals.user) throw redirect(303, '/login')
        //makes sure only logged in users get to see the site 

    const mode = url.searchParams.get('mode') ?? 'original';
    const threshold = Number(url.searchParams.get('threshold') ?? 0.5);
    const headingWeight = Number(url.searchParams.get('headingWeight') ?? 0.05);
    const neighborWeight = Number(url.searchParams.get('neighborWeight') ?? 0.90);
    const roadTypePriorityWeight = Number(url.searchParams.get('roadTypePriorityWeight') ?? 0.05);

    // Server-side logging to verify parameters are being received
    if (mode === 'snapped') {
        console.log('Server loading with weights:', {
            headingWeight,
            neighborWeight,
            roadTypePriorityWeight,
            sum: headingWeight + neighborWeight + roadTypePriorityWeight
        });
    }

    return {
    base_chart_data:extractData(),
    map_plot_data: await load_map_data(),
    map_snap_data:await load_map_snap_data({threshold, mode, headingWeight, neighborWeight, roadTypePriorityWeight}),
    snap_quality_data: await load_snap_quality_data()
    };
}

