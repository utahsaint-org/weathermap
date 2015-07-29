# Instructions for configuring Weathermap

## Files

`public/index.html`: The "main" file that sets the map size and loads
CSS, required Javascript, sub-maps, etc. Some of this can be tweaked,
but edit carefully.

`public/maps/config.json`: The configuration for the primary map. This
is where you define nodes on the map, connections between the nodes,
and some styling of the map.

`public/css/weathermap.css`: CSS styling for the map pages.

`public/css/svg-global.css`: CSS styling for map elements (nodes, circuits)

## Configuring a map

Notes on the structure of `public/maps/config.json`:

JSON Hash Keyword | Description
------------------|--------------------------------------------
`mapName`           | name of the map, added to upper left corner
`logo`              | logo, added to lower	right corner
`updateInterval`    | how often	to refresh data	on map (seconds)
`linkStyle`         | width of circuits in pixels, automatically scaled from minWidth to maxWidth<br />example: `{ "maxWidth": 13, "minWidth": 5 }`
`utilizationColors` | circuit colors based on % utilization<br />example: `{ "100": "red", "70": "orange", "50": "yellow", "1": "green", "0": "gray" }`
`nodes`             | place a node on the map, used to connect circuits<br />short-form example: `{ "NODENAME": [50, 700, "square"] }`<br />short-form format: `[x-coord, y-coord, shape - "square" or default to circle]`)<br />long-form example: `"NODENAME": { "coords": [200, 350], "type":"square", "label": ["i2 +","TR"], "link": "?site=site1" }`<br />long-form format: `coords: [x,y]` is required, `type` is `square` or defaults to circle, `label` is optional and over-rides default lable. Label can be string or `[]` for multi-line labels. `link` links to a URL when the node is clicked.
`links`             | connect two nodes with a circuit<br />example: `"NODE1-NODE2": { "bw": "100G", "nodes": ["NODEONE", "NODETWO"], "inLabelDelta": [-10, 0], "outLabelDelta": [-20,5], "add": ["ANOTHER-CIRCUIT","AND-ANOTHER.reverse"] }`<br />format notes:<br />Link name (`NODE1-NODE2`) must exactly match a circuit name<br />`bw` is required and is an integer with an optional unit K,M,G<br/>`linkDelta` (optional) shifts the apex by `[x,y]` pixels<br />`nodes` (optional) over-rides the default nodes parsed from the link name<br />`inLabelDelta`, `outLabelDelta` shifts the circuit labels by `[x,y]`<br />`add` creates an aggregate circuit by adding utilization of other circuits. If the circuit name includes `.reverse`, the ends of the circuit are switched when adding
`recheckConfig`     | periodically check whether the map .json file has changed, and force refresh if it has (seconds)
`utilizationURL`    | URL to check for circuit utilization data, usually `"/api/utilization"`


