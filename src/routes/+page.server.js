import { extractData } from "$lib/data/processing_script";
import { load_map_data } from "$lib/data/map_plotter";
export async function load(){
    return {
        base_chart_data:extractData(),
        map_plot_data:load_map_data(),

    };

}

