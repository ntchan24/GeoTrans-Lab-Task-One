import { extractData } from "$lib/data/processing_script";
import { load_map_data } from "$lib/data/map_plotter";
import { load_map_snap_data } from "$lib/data/map_snap";

export async function load(){
    return {
        base_chart_data:extractData(),
        map_plot_data:load_map_data(),
        map_snap_data:await load_map_snap_data()

    };

}

