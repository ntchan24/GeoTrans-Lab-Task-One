[out:json][timeout:120];
(
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary|tertiary|residential|unclassified|service|living_street|track|pedestrian|footway|cycleway)$"](53.40,-113.75,53.67,-113.25);
);
out geom;